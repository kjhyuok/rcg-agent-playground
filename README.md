# 🚀 Agent Playground — Build! Deploy! Observe!

**Amazon Bedrock AgentCore Workshop** 참가자용 Agent 체험 UI

![Agent Playground](docs/screenshot-main.png)

## 개요

워크샵 참가자가 Phase별로 배포한 AgentCore Agent를 **시각적으로 호출하고, 내부 동작 원리를 실시간으로 확인**할 수 있는 대시보드입니다.

### 핵심 기능

| 기능 | 설명 |
|------|------|
| **Agent 채팅** | 배포한 Agent에 자연어로 질문 → 실시간 스트리밍 응답 |
| **Execution Flow** | AgentCore 9개 서비스가 순차 점등 (Gateway → LLM → Memory → Policy...) |
| **Phase Progress** | 워크샵 진행 상황 시각화 (추천 → CS/수요 → 커스텀 → Arena) |
| **Agent 카드** | Phase별 Agent 상태 (ACTIVE/LOCKED), ARN 등록 시 자동 활성화 |
| **Settings** | Agent별 ARN 입력 → 즉시 연결 |

---

## 워크샵 연동 흐름

```
┌─ Workshop Studio 계정 (참가자별 1개) ──────────────────────┐
│                                                             │
│  EC2 인스턴스                                               │
│  ├── Code Editor (port 8443) ← 코드 작성 + deploy          │
│  ├── Agent Playground (port 3000) ← 이 앱                  │
│  └── IAM Role (AgentCore + Bedrock 전체 권한)              │
│                                                             │
│  AgentCore 리소스                                           │
│  ├── Gateway + Lambda (Tool 함수)                          │
│  ├── Runtime (Agent 배포 엔드포인트)                        │
│  ├── Memory (고객 맥락 저장)                               │
│  └── CloudWatch (Trace/Observability)                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘

참가자 경험:
  1. Code Editor에서 Agent 코드 작성 + deploy
  2. Agent Playground에서 ARN 입력
  3. 채팅으로 Agent 호출 → Execution Flow에서 동작 원리 확인
  4. Phase 진행할수록 서비스가 하나씩 점등 (성취감!)
```

---

## 기술 스택

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 + TypeScript + Tailwind CSS |
| UI Components | shadcn/ui + Framer Motion |
| Backend | Flask (Python) + boto3 |
| Agent 호출 | AWS Bedrock AgentCore Runtime API |
| 디자인 | Dark theme + Glassmorphism + Cyan/Purple accent |

---

## 로컬 실행 (개발용)

```bash
# 프론트엔드
npm install
npm run dev -- -p 3333
# → http://localhost:3333

# 백엔드 (별도 터미널)
cd api
pip install -r requirements.txt
python3 app.py
# → http://localhost:5050
```

---

## EC2 배포 (워크샵용)

### 사전 요구사항
- EC2 인스턴스: `t3.large` (Amazon Linux 2023 or Ubuntu 22.04)
- IAM Role: `bedrock-agentcore:*`, `bedrock:*`, `logs:*` 권한
- Security Group: port 3000 (Playground), 8443 (Code Editor) 오픈

### 배포 스크립트

```bash
#!/bin/bash
# EC2 UserData 또는 수동 실행

# 1. 시스템 패키지
sudo yum install -y git nodejs npm python3-pip  # Amazon Linux
# sudo apt install -y git nodejs npm python3-pip  # Ubuntu

# 2. 코드 클론
git clone https://github.com/kjhyuok/rcg-agent-playground.git /opt/playground
cd /opt/playground

# 3. 프론트엔드 빌드
npm install
npm run build

# 4. 백엔드 설치
cd api
pip3 install -r requirements.txt

# 5. 환경변수
export AWS_REGION=us-east-1
export NEXT_PUBLIC_API_URL=http://localhost:5050

# 6. 실행 (프로덕션)
cd /opt/playground
nohup python3 api/app.py &

# 또는 systemd 서비스로 등록
```

### CloudFormation Output
```yaml
Outputs:
  PlaygroundURL:
    Value: !Sub "http://${EC2Instance.PublicIp}:3000"
    Description: Agent Playground URL
```

---

## 사용법 (참가자)

### 1. Agent 등록
- 우측 상단 **Settings** 클릭
- Phase별 Agent ARN 입력 (deploy 후 출력되는 ARN 복사)
- 저장 → 해당 Agent 카드 자동 활성화

### 2. Agent 호출
- 활성화된 Agent 카드 클릭
- 채팅 입력란에 질문 입력 + Enter
- 응답이 스트리밍으로 표시됨

### 3. Execution Flow 관찰
- 우측 패널에서 AgentCore 서비스가 순차 점등
- Gateway (Tool 호출) → LLM (추론) → Memory (맥락) → Policy (가드레일)
- Phase 진행할수록 더 많은 서비스가 활성화됨

---

## Phase별 활성화 서비스

| Phase | Agent | Execution Flow 서비스 |
|-------|-------|---------------------|
| Phase 1 | 상품 추천 Agent | Gateway, Bedrock LLM, Code Interpreter, Observability |
| Phase 2 | CS / 수요예측 Agent | + Memory, Policy, Browser |
| Phase 3 | 나만의 Agent | + Multi-Agent (A2A), Evaluations |

---

## 프로젝트 구조

```
rcg-agent-playground/
├── src/
│   ├── app/page.tsx              # 메인 페이지 (상태 관리)
│   ├── components/
│   │   ├── agent-sidebar.tsx     # 좌측 Agent 카드
│   │   ├── chat-panel.tsx        # 중앙 채팅 (스트리밍)
│   │   ├── execution-flow.tsx    # 우측 서비스 점등
│   │   ├── metrics-bar.tsx       # 상단 Progress + Last invoke
│   │   └── settings-modal.tsx    # ARN 설정 모달
│   └── lib/
│       ├── agentcore-services.ts # 9개 서비스 정의
│       ├── api.ts                # Flask API 클라이언트
│       └── types.ts              # TypeScript 타입
├── api/
│   ├── app.py                    # Flask 백엔드
│   └── requirements.txt
├── public/
│   └── agentcore-icon.png
└── package.json
```

---

## Related Repositories

- [rcg-agentcore-workshop](https://github.com/kjhyuok/rcg-agentcore-workshop) — 워크샵 코드 (Lambda, Agent, Scripts)
- [rcg-agentcore-workshop-guide](https://github.com/kjhyuok/rcg-agentcore-workshop-guide) — MkDocs 가이드
