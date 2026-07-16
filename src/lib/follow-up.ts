// 대화 맥락 기반 "다음 질문" 추천 (룰셋).
//
// 원칙: 여기서 나오는 모든 후보 질문은 워크샵 CloudFormation에 하드코딩된
// 샘플 데이터로 "반드시 응답 가능"해야 한다. LLM 동적 생성이 아니라, 방금
// 대화(사용자 질문 + Agent 응답)에서 실제로 등장한 엔티티만 골라 검증된
// 질문으로 분기하므로 존재하지 않는 데이터(예: 없는 고객 ID)를 묻지 않는다.
//
// 데이터 출처: static/workshop-resources.yaml 의 Lambda 함수들
//  - 고객: C001(김건강·VIP·견과류알러지), C002(이뷰티·GOLD), C003(박바쁨·유제품알러지)
//  - 주문: ORD-20260620-001~003, ORD-20260625-010, ORD-2024-101/999
//  - 상품: P001~P012 (건강식품/뷰티/음료/간편식/전자기기)
//  - CS: 반품정책(전자기기/건강식품/뷰티/간편식/생활용품), 배송조회
//  - CS Agent Browser: 경쟁사 가격비교(보조배터리/무선이어폰/시카크림)

export type AgentType = "recommend" | "cs" | "custom";

// 대화에서 안전하게 참조 가능한 고객 ID (샘플 데이터에 존재하는 것만)
const KNOWN_CUSTOMERS = ["C001", "C002", "C003"];

interface FollowUpContext {
  agentType: AgentType;
  userText: string; // 방금 사용자가 보낸 질문
  replyText: string; // Agent 응답
}

// 텍스트에서 등장한 알려진 고객 ID를 순서대로(중복 제거) 추출
function extractCustomers(text: string): string[] {
  const found: string[] = [];
  for (const c of KNOWN_CUSTOMERS) {
    if (text.includes(c) && !found.includes(c)) found.push(c);
  }
  return found;
}

// 텍스트에서 주문번호(ORD-...) 추출
function extractOrders(text: string): string[] {
  const matches = text.match(/ORD-[0-9]{4,8}-?[0-9]{0,3}/g) || [];
  return Array.from(new Set(matches));
}

// 경쟁사 mock 사이트에 실제 존재하는 상품만 (Browser 질문이 헛돌지 않도록)
// competitor-prices.html: 보조배터리 / 무선이어폰 / 시카(수분)크림
function competitorProductIn(text: string): string | null {
  if (text.includes("보조배터리")) return "보조배터리";
  if (text.includes("이어폰")) return "무선 이어폰";
  if (text.includes("시카") || text.includes("수분크림")) return "시카 수분크림";
  return null;
}

// 응답 텍스트로 "1차 질문이 어느 CS 단계였는지" 판별 → 다음 서비스로 유도
function csStageOf(text: string): "return_processed" | "policy_shown" | "escalation" | "lookup" | "delivery" | null {
  if (text.includes("에스컬레이션") || text.includes("별도 승인") || text.includes("승인이 필요")) return "escalation";
  if (text.includes("환불") && (text.includes("처리") || text.includes("완료") || text.includes("원"))) return "return_processed";
  if (text.includes("반품") && (text.includes("정책") || text.includes("가능") || text.includes("기간") || text.includes("조건"))) return "policy_shown";
  if (text.includes("배송") && (text.includes("중") || text.includes("완료") || text.includes("추적") || text.includes("도착"))) return "delivery";
  if (text.includes("주문") || text.includes("결제") || text.includes("상품")) return "lookup";
  return null;
}

// "이 고객 말고 다른 알려진 고객"을 하나 고른다 (교차 비교 질문용)
function otherCustomer(used: string[]): string {
  return KNOWN_CUSTOMERS.find((c) => !used.includes(c)) || "C002";
}

/**
 * 방금 대화를 근거로 검증된 후속 질문 2~3개를 만든다.
 * 응답 불가능한 질문이 섞이지 않도록, 등장한 엔티티가 없으면
 * 각 Agent의 안전한 기본 후속 질문으로 폴백한다.
 */
export function buildFollowUps(ctx: FollowUpContext): string[] {
  const { agentType, userText, replyText } = ctx;
  const combined = `${userText}\n${replyText}`;
  const customers = extractCustomers(combined);
  const orders = extractOrders(combined);
  const primaryCustomer = customers[0];
  const suggestions: string[] = [];

  if (agentType === "recommend") {
    if (primaryCustomer) {
      // 추천 Agent는 Memory가 없어 매 질문이 독립적 → 항상 고객 ID를 포함시킨다
      suggestions.push(`${primaryCustomer} 고객의 구매 이력을 반영해서 다시 추천해줘`);
      suggestions.push(`${primaryCustomer} 고객에게 추천할 뷰티 카테고리 상품 알려줘`);
      suggestions.push(`${otherCustomer(customers)} 고객에게도 같은 기준으로 추천해줘`);
    } else {
      suggestions.push("고객 C001에게 적합한 상품 3개 추천해주세요");
      suggestions.push("C002 고객 구매 이력 기반으로 추천해줘");
      suggestions.push("C003 고객에게 어울리는 간편식 추천해줘");
    }
  } else if (agentType === "cs") {
    // CS Agent는 Memory가 있어 "아까 그 주문"을 기억한다. 후속 질문은
    // 방금 응답이 어느 단계였는지(csStageOf) 보고 "다음 서비스"로 자연스럽게 유도한다.
    //   조회/배송 → 반품정책(Gateway) → 환불금액(Policy 에스컬레이션) → 경쟁사비교(Browser)
    const ord = orders[0];
    const stage = csStageOf(combined);
    const product = competitorProductIn(combined);

    if (ord) {
      if (stage === "escalation" || stage === "return_processed") {
        // 환불까지 끝남 → Browser(경쟁사)와 고객 단위 Memory로 유도
        if (product) suggestions.push(`그 ${product}, 경쟁사 현재 최저가랑 비교해줘`);
        suggestions.push("아까 그 주문 고객의 다른 주문도 있는지 확인해줘");
        suggestions.push(`${ord} 반품 정책 조건도 다시 정리해줘`);
      } else if (stage === "policy_shown") {
        // 반품 정책 확인함 → 환불 처리(Policy 트리거)로 유도
        suggestions.push(`그럼 ${ord} 환불하면 얼마 돌려받는지 처리해줘`);
        if (product) suggestions.push(`이 ${product}, 다른 데가 더 싸다는데 비교해줘`);
        suggestions.push("아까 그 주문, 반품 가능 여부랑 환불 조건 같이 알려줘");
      } else {
        // 조회/배송 단계 → 반품(Gateway) + 경쟁사(Browser)로 분기
        suggestions.push(`${ord} 이 상품 반품하고 싶은데 가능한지 알려줘`);
        if (product) suggestions.push(`그 ${product}, 경쟁사 가격이랑 비교해줘`);
        suggestions.push(`${ord} 환불하면 얼마 받는지도 알려줘`);
      }
    } else if (primaryCustomer) {
      suggestions.push(`${primaryCustomer} 고객의 최근 주문 상태 알려줘`);
      suggestions.push(`${primaryCustomer} 고객 주문 중 반품 가능한 게 있는지 확인해줘`);
      if (product) suggestions.push(`그 ${product}, 경쟁사 최저가랑 비교해줘`);
    } else {
      // 폴백 — 각기 다른 서비스를 켜는 검증된 질문 (조회/에스컬레이션/경쟁사)
      suggestions.push("주문 ORD-20260620-003 환불 처리해줘 (69,000원)");
      suggestions.push("보조배터리 경쟁사 현재 가격이랑 비교해줘");
      suggestions.push("ORD-20260620-002 배송 상태랑 반품 정책 알려줘");
    }
  } else {
    // custom Agent — 데이터 의존이 낮으므로 워크샵 개념 위주의 안전한 질문
    suggestions.push("여러 Agent를 연결해서 처리하는 예시를 보여줘");
    suggestions.push("이 응답의 품질을 어떻게 평가할 수 있어?");
  }

  return suggestions.slice(0, 3);
}
