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
    if (orders.length > 0) {
      const ord = orders[0];
      suggestions.push(`${ord} 주문의 배송 상태 자세히 알려줘`);
      suggestions.push(`${ord} 건 반품 정책이 어떻게 되는지 확인해줘`);
      suggestions.push("이 상품 경쟁사 최저가랑 비교해줘");
    } else if (primaryCustomer) {
      suggestions.push(`${primaryCustomer} 고객의 최근 주문 상태 알려줘`);
      suggestions.push(`${primaryCustomer} 고객 배송 지연 문의에 어떻게 대응할까?`);
      suggestions.push("전자기기 반품 정책 알려줘");
    } else {
      suggestions.push("주문 ORD-20260620-002 배송 상태 알려줘");
      suggestions.push("C001 고객 최근 주문 상태 알려줘");
      suggestions.push("보조배터리 경쟁사 최저가 비교해줘");
    }
  } else {
    // custom Agent — 데이터 의존이 낮으므로 워크샵 개념 위주의 안전한 질문
    suggestions.push("여러 Agent를 연결해서 처리하는 예시를 보여줘");
    suggestions.push("이 응답의 품질을 어떻게 평가할 수 있어?");
  }

  return suggestions.slice(0, 3);
}
