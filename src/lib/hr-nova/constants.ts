// ── CSS 변수 / 색상 (원본 :root 변수 그대로) ─────────────────
export const C = {
  primary:     '#1e3a5f',
  primaryLight:'#2d5a8e',
  accent:      '#e8a020',
  accentLight: '#f5c842',
  success:     '#27ae60',
  danger:      '#e74c3c',
  warning:     '#f39c12',
  lightBg:     '#f8fafc',
  border:      '#e2e8f0',
  cardShadow:  '0 4px 20px rgba(0,0,0,0.08)',
};

// ── 4대보험 요율 (원본 INS 상수 그대로) ─────────────────────
export const INS_RATES = { pension:4.75, health:3.595, employ:1.40, accident:1.10 };
export const RETIRE_RATE = 8.3;

// ── 직급 목록 (원본 DL_GRADES 그대로) ───────────────────────
export const DL_GRADES = ['부장','차장','과장','대리','주임','사원','계약직','인턴'] as const;
export const DL_DEFAULTS: Record<string,number> = {
  '부장':7000,'차장':6200,'과장':5500,'대리':4500,'주임':3800,'사원':3300,'계약직':2800,'인턴':2400
};

// ── 부서 목록 (원본 DL_DEPTS 완전 동일) ─────────────────────
export const DL_DEPTS = [
  { id:'exec',     name:'총지배인/본부장', section:'임원',
    jobs:[{jid:'gm',jname:'총지배인'},{jid:'vp',jname:'본부장'}] },
  { id:'admin',    name:'인사총무팀', section:'판관 부문',
    jobs:[{jid:'hd',jname:'지원팀장'},{jid:'pur',jname:'구매'},{jid:'edu',jname:'교육'},{jid:'gen',jname:'총무'}] },
  { id:'finance',  name:'기획재무팀', section:'판관 부문',
    jobs:[{jid:'hd',jname:'팀장'},{jid:'plan',jname:'기획파트장'},{jid:'plan2',jname:'기획팀원'},{jid:'fin',jname:'재무파트장'},{jid:'fin2',jname:'재무팀원'}] },
  { id:'it',       name:'전산팀', section:'판관 부문',
    jobs:[{jid:'hd',jname:'전산팀장'},{jid:'dev',jname:'연구원'}] },
  { id:'facility', name:'시설팀', section:'판관 부문',
    jobs:[{jid:'hd',jname:'시설팀장'},{jid:'mech',jname:'기계'},{jid:'elec',jname:'영선'},{jid:'power',jname:'전기'},{jid:'fire',jname:'소방'}] },
  { id:'canteen',  name:'직원식당', section:'판관 부문',
    jobs:[{jid:'chef',jname:'주방장'},{jid:'staff',jname:'찬모'}] },
  { id:'sales',    name:'세일즈&마케팅', section:'매출 부문',
    jobs:[{jid:'dir',jname:'영업부장'},{jid:'hd',jname:'팀장'},{jid:'sales',jname:'세일즈'},{jid:'rm',jname:'RM'},{jid:'ota',jname:'OTA'},{jid:'pr',jname:'홍보'},{jid:'prod',jname:'상품개발'},{jid:'design',jname:'디자인'}] },
  { id:'room',     name:'객실팀', section:'매출 부문',
    jobs:[{jid:'hd',jname:'객실팀장'},{jid:'fhd',jname:'프런트파트장'},{jid:'front',jname:'프런트'},{jid:'duty',jname:'당직지배인'},{jid:'rhd',jname:'레즈파트장'},{jid:'rez',jname:'레즈'},{jid:'hkhd',jname:'H/K파트장'},{jid:'hk',jname:'H/K'},{jid:'rsvhd',jname:'예약파트장'},{jid:'rsv',jname:'예약'}] },
  { id:'fb',       name:'식음팀', section:'매출 부문',
    jobs:[{jid:'hd',jname:'식음팀장'},{jid:'buf',jname:'뷔페매니저'},{jid:'bf',jname:'조식팀원'},{jid:'kor',jname:'한식당매니저'},{jid:'kor2',jname:'한식당팀원'},{jid:'west',jname:'양식당매니저'},{jid:'west2',jname:'양식당팀원'},{jid:'jpn',jname:'일식당매니저'},{jid:'jpn2',jname:'일식팀원'},{jid:'bkr',jname:'베이커리매니저'},{jid:'bkr2',jname:'베이커리팀원'},{jid:'lounge',jname:'라운지'},{jid:'ban',jname:'연회장매니저'},{jid:'ban2',jname:'연회장팀원'}] },
  { id:'kitchen',  name:'조리팀', section:'매출 부문',
    jobs:[{jid:'chef',jname:'주방장'},{jid:'sous',jname:'부주방장'},{jid:'staff',jname:'팀원'}] },
] as const;

// ── 업계 벤치마크 (원본 getApplicableBenchmark 기준표) ───────
export const BENCHMARK: Record<string,{labor:[number,number], op:[number,number]}> = {
  '5성급': {labor:[25,32], op:[12,20]},
  '4성급': {labor:[28,35], op:[10,17]},
  '3성급': {labor:[30,38], op:[8,14]},
  '2성급': {labor:[32,40], op:[6,12]},
  '기타':  {labor:[30,38], op:[8,15]},
};

// ── 부서 벤치마크 비중 (%) ───────────────────────────────────
export const DEPT_BM: Record<string,{pct:number,label:string,icon:string}> = {
  exec:    {pct:5,  label:'총지배인/본부장', icon:'👔'},
  admin:   {pct:8,  label:'인사총무',        icon:'🏢'},
  finance: {pct:5,  label:'기획재무',        icon:'💰'},
  it:      {pct:3,  label:'전산팀',          icon:'💻'},
  facility:{pct:12, label:'시설팀',          icon:'🔧'},
  canteen: {pct:3,  label:'직원식당',        icon:'🍱'},
  sales:   {pct:8,  label:'세일즈&마케팅',   icon:'📣'},
  room:    {pct:30, label:'객실팀',          icon:'🛏️'},
  fb:      {pct:25, label:'식음팀',          icon:'🍽️'},
  kitchen: {pct:10, label:'조리팀',          icon:'👨‍🍳'},
};

// ── 차트 팔레트 (원본 CAT_COLORS / CHART_PALETTE 그대로) ────
export const CAT_COLORS: Record<string,{main:string,light:string}> = {
  '인건비':    {main:'#C53030',light:'#FED7D7'},
  '제세공과금':{main:'#2C5282',light:'#BEE3F8'},
  '일반관리비':{main:'#276749',light:'#C6F6D5'},
  '재료비/원가':{main:'#975A16',light:'#FEFCBF'},
  '판매마케팅':{main:'#553C9A',light:'#E9D8FD'},
  '운영소모품':{main:'#2C7A7B',light:'#B2F5EA'},
  '자산관련':  {main:'#B7791F',light:'#FEFCBF'},
  '영업외비용':{main:'#702459',light:'#FED7E2'},
};

export const CHART_PALETTE = {
  navy:'#1e3a5f', blue:'#2d5a8e', amber:'#e8a020',
  emerald:'#27ae60', red:'#e74c3c', rose:'#e07070',
};

// ── 월별 카테고리 ────────────────────────────────────────────
export const MT_CATS = ['labor','tax','admin','mat','mkt','sup','nonop'] as const;
export const MT_LABELS = ['인건비','제세공과금','일반관리비','재료비','마케팅비','소모품비','영업외비용'] as const;
export const MT_COLORS = ['#C53030','#2C5282','#276749','#975A16','#553C9A','#2C7A7B','#702459'] as const;

// ── 사이드바 nav 메뉴 ─────────────────────────────────────────
export const NAV_ITEMS = [
  { section:'메인 메뉴' },
  { href:'/hr-nova',                icon:'fas fa-tachometer-alt',      label:'대시보드',          subtitle:'호텔 손익 현황을 한눈에 확인하세요' },
  { section:'데이터 입력' },
  { href:'/hr-nova/hotel-info',     icon:'fas fa-hotel',               label:'호텔 기본정보',     subtitle:'기본 정보 및 분석 설정' },
  { href:'/hr-nova/cost-overview',  icon:'fas fa-list-alt',            label:'비용현황 입력',     subtitle:'당기·전년도 비용 전체 입력' },
  { href:'/hr-nova/revenue',        icon:'fas fa-chart-line',          label:'매출 입력',         subtitle:'객실·F&B·기타 매출 입력' },
  { href:'/hr-nova/labor',          icon:'fas fa-users',               label:'인건비 입력 ★',    subtitle:'부서·직급별 인건비 설정' },
  { href:'/hr-nova/fixed-cost',     icon:'fas fa-lock',                label:'고정비 입력',       subtitle:'제세공과금·일반관리비 입력' },
  { href:'/hr-nova/variable-cost',  icon:'fas fa-sliders-h',           label:'변동비 입력',       subtitle:'재료비·마케팅·소모품비 입력' },
  { section:'분석 & 리포트' },
  { href:'/hr-nova/pl-analysis',    icon:'fas fa-file-invoice-dollar', label:'손익 분석',         subtitle:'손익계산서 전체 분석' },
  { href:'/hr-nova/labor-analysis', icon:'fas fa-user-tie',            label:'인건비 분석',       subtitle:'인건비 구조 심층 진단' },
  { href:'/hr-nova/compare',        icon:'fas fa-balance-scale',       label:'비교 분석',         subtitle:'예산·전년 대비 비교' },
  { href:'/hr-nova/scenario',       icon:'fas fa-magic',               label:'시나리오 분석',     subtitle:'인건비 변화 시뮬레이션' },
  { href:'/hr-nova/monthly-trend',  icon:'fas fa-chart-line',          label:'월별 비용 추이',    subtitle:'12개월 비용 추이 분석' },
  { href:'/hr-nova/budget-actual',  icon:'fas fa-balance-scale',       label:'예산 대비 실적',    subtitle:'예산 집행 현황 및 경고' },
  { section:'AI 분석' },
  { href:'/hr-nova/ai-report',      icon:'fas fa-robot',               label:'AI 컨설팅 리포트',  subtitle:'AI 기반 경영 컨설팅 리포트', accent:true },
] as const;
