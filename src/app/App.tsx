import React, { useState, useEffect, useRef } from "react";
import {
  ClipboardCheck,
  LogOut,
  MoreHorizontal,
  Download,
  Plus,
  SlidersHorizontal,
  UserRound,
  X,
  ChevronRight,
  RefreshCw,
  Trash2,
  History,
  Check,
  Clock,
  RotateCcw,
  Bot,
  Sparkles,
  ThumbsUp,
  MessageSquareText,
  AlertCircle,
  Pencil,
  ShieldCheck,
  Inbox,
  Award,
  Send,
  FileText,
  CalendarDays,
  MessageSquareWarning,
} from "lucide-react";

type Role = "agent" | "inspector" | "manager" | "admin";
type AgentGroup = "一线客服" | "VIP一线客服" | "高潜客服" | "VIP客服";
const AGENT_GROUPS: AgentGroup[] = ["一线客服", "VIP一线客服", "高潜客服", "VIP客服"];
type Account = { name: string; password: string; role: Role; group?: AgentGroup };
type View = "quality" | "rules" | "records" | "members" | "messages" | "reports" | "feedback";
const roleLabel = (r: Role) => r === "admin" ? "超级管理者" : r === "manager" ? "业务管理者" : r === "inspector" ? "质检人员" : "客服人员";
const canEditRules = (r: Role) => r === "manager" || r === "admin";

// 消息中心：客服申诉 / 申奖(自荐) / 优秀案例周报。纯内存演示。
type MsgKind = "appeal" | "award" | "weekly";
type MsgStatus = "pending" | "approved" | "rejected";
type Vote = { by: string; result: "approve" | "reject"; at: string };
type Message = {
  id: string;
  kind: MsgKind;
  from: string;
  to: string[];
  complaintId?: string;
  complaintTitle?: string;
  body: string;
  createdAt: string;
  status: MsgStatus;
  reply?: { by: string; text: string; at: string; result: "approved" | "rejected" };
  votes?: Vote[];
  readBy: string[];
};
type ExcellentCase = { id: string; complaintId: string; agent: string; title: string; summary: string; source: "inspector" | "award"; addedBy: string; addedAt: string };
// 知识库：全局条目，可被专用规则的各评分维度引用。内容可为文本或外部链接。
type KnowledgeItem = { id: string; title: string; kind: "text" | "link"; content: string };

// 消息可见性：周报→全体（客服看下发、质检/管理者看已发出的）；申奖→全体质检/管理者+发起客服；申诉→发起客服+被抄送质检人员。
function visibleMessages(messages: Message[], user: Account): Message[] {
  const insp = user.role === "inspector" || user.role === "manager" || user.role === "admin";
  return messages.filter(m => {
    if (m.kind === "weekly") return true; // 周报全员可见
    if (m.kind === "award") return insp || m.from === user.name;
    return m.from === user.name || m.to.includes(user.name); // appeal
  });
}
function unreadCount(messages: Message[], user: Account): number {
  return visibleMessages(messages, user).filter(m => !m.readBy.includes(user.name)).length;
}
type ChatMsg = { from: "user" | "agent"; text: string; time: string };
type AiIssue = { rule: string; score: string; quote: string };
// 客服类型不再写死：改为规则页「客服类型」里可增删的一份清单（见 SEED_AGENT_TYPES），
// 规则据此设定生效范围。这里保持字符串别名，让既有的 agentType 标注继续可用。
type AgentType = string;
const SEED_AGENT_TYPES: AgentType[] = ["AI客服", "一线客服", "VIP一线客服", "专属客服", "高潜客服"];
// 同一用户的历史客诉会话：date 为发生时间，demand 为 AI 总结的「具体客诉诉求」，chat 为完整会话记录。
type HistorySession = { id: string; date: string; demand: string; chat: ChatMsg[] };
// 客服提交的工单：描述区为若干「字段名→值」，另含附件、UID、状态、关注人、历史记录。
type WorkOrderLog = { by: string; at: string; text: string };
type WorkOrder = {
  id: string;
  fields: { label: string; value: string }[];
  attachments: string[];
  uid: string;
  status: string;
  watchers: string[];
  logs?: WorkOrderLog[];
};
// 历史客诉界面上方并列两个部分，各自独立、互不从属：
// 一、玩家历史处理信息（handling）——用四个固定字段把历史客诉交接清楚：
//   demand 明确诉求 / provided 玩家已提供、已完成的事项 / handled 客服已处理内容 / status 当前处理状态。
//   取材范围不是「最近一次」，而是与当前客诉最相关、最近的 1-3 次客诉，由这几次归纳出一组字段；
//   provided 只写客服实际拿到手、且之后仍然有效的东西，不含短信、邮箱验证码这类一次性验证信息——
//   过期即失效，对接手的人没有复用价值。
// 二、特殊情况备注（notes）——来自 AIhelp 里客服同学针对该用户行为留下的历史标注，自由文本，
//   不做风险等级标注，界面上只呈现标注正文本身（不带标注人、日期与处置提示），只按内容分两类：
//   risk 风控标记——未成年退费 / 投诉 / 负债 / 无法自控 / 存在偏激行为等，对应应主动风控干预，
//     需干预未干预即算未按工作流程处理；
//   benefit 权益/福利信息——专属客服、已申请过的礼包、申请福利的时间与类型、认购状态等，
//     用于判断本次该不该给（如本月已申请过 → 本次应拒绝；风控 + 福利咨询 → 应先走认购）。
type HistoryHandling = { demand: string; provided: string; handled: string; status: string };
type NoteKind = "risk" | "benefit";
type SpecialNote = { kind: NoteKind; text: string };
type HistorySummary = { handling: HistoryHandling; notes: SpecialNote[] };
// 特殊情况备注两类的呈现样式：风控标记偏警示色，权益/福利偏中性蓝。
const NOTE_META: Record<NoteKind, { label: string; box: string; chip: string; dot: string }> = {
  risk: {
    label: "风控标记",
    box: "border-[#f2dcdc] bg-white/85",
    chip: "bg-[#fbeaea] text-[#c54f4f]",
    dot: "bg-[#e29a9a]",
  },
  benefit: {
    label: "权益/福利信息",
    box: "border-[#dbe6f6] bg-white/85",
    chip: "bg-[#eaf1ff] text-[#3d6fe0]",
    dot: "bg-[#9db8ee]",
  },
};
type Complaint = {
  id: string;
  agent: string;
  agentType: AgentType;
  user: string;
  score: number;
  chat: ChatMsg[];
  aiIssues: AiIssue[];
  history?: HistorySession[];
  historySummary?: HistorySummary;
  workOrder?: WorkOrder;
};
type Review = {
  agreed: boolean;
  submitted: boolean;
  objectedRules: string[];
  reran: boolean;
  suggestedScore: string;
  detail: string;
  agentNote: string;
  deductedRules: string[];
};
type Principle = { title: string; content: string; scopes?: AgentType[] };
const principleApplies = (p: Principle, t: AgentType) => !p.scopes || p.scopes.length === 0 || p.scopes.includes(t);

// —— 质检任务 ——
// complaintIds：本任务实际纳入的客诉。报告模块据此判断「该任务客诉是否已全部复审完」。
type TaskFilters = { date: string; rounds: string; limit: string; statuses: string[]; vipMin: string; vipMax: string; includeTags: string[]; excludeTags: string[]; agents: string[] };
type TaskRow = { name: string; status: string; note: string; date: string; ruleVersion: string; complaintIds: string[]; filters?: TaskFilters };

// —— 历史总结反馈埋点 ——
// 质检人员在复审界面对「玩家历史处理信息」点「我要反馈」，写下这份总结缺了哪些质检要用的信息、
// 哪些其实不需要。埋点把反馈连同它产生的上下文一起记下来：哪个任务 → 哪个客诉 → 该总结取材的
// 哪几次历史客诉，好让看到反馈的人能定位到具体是哪一份总结出的问题，据此调整生成总结的提示词。
// 只有超级管理者能看这些数据（业务管理者也看不到），因为提示词调整权在超级管理者手里。
// historyRefs 记的是该客诉当时可见的历史客诉（总结的取材范围），而非单独一条——
// 这份总结本身就是由最相关、最近的 1-3 次历史客诉归纳出来的，落到单条会失真。
type SummaryFeedback = {
  id: string;
  at: string;
  by: string;
  byRole: Role;
  taskName: string;
  complaintId: string;
  agent: string;
  user: string;
  historyRefs: { id: string; date: string }[];
  text: string;
};

// 原型演示用的种子反馈：让超级管理者一进「总结反馈」就能看到实际会收到什么样的信息，
// 而不是一张空表。真实环境里这张表由质检人员逐条提交后累积。
const SEED_SUMMARY_FEEDBACKS: SummaryFeedback[] = [
  {
    id: "fb3", at: "2024-10-11 10:52", by: "王哲", byRole: "inspector",
    taskName: "2024-10-11 客诉服务质检", complaintId: "c4", agent: "陈静", user: "机械鲨富大傻俏",
    historyRefs: [{ id: "c4-h1", date: "2024-10-05 20:10:16" }],
    text: "上次同样是充值未到账，客服口头承诺过 48 小时和超时全额退款，总结里没写这两个承诺。质检本次要判断有没有重复失约，缺了这条就判不了。",
  },
  {
    id: "fb2", at: "2024-10-11 10:20", by: "申慧", byRole: "inspector",
    taskName: "2024-10-11 客诉服务质检", complaintId: "c1", agent: "李梦", user: "用户01363539162",
    historyRefs: [
      { id: "c1-h0", date: "2024-10-03 22:05:11" },
      { id: "c1-h1", date: "2024-09-28 21:14:07" },
      { id: "c1-h2", date: "2024-09-15 10:41:50" },
    ],
    text: "「处理状态」只写了已跟进，没写上次玩家为什么投诉、投诉后怎么收尾的。另外异地登录的核验过程写得太细，质检本次的活动门槛问题用不上。",
  },
  {
    id: "fb1", at: "2024-10-08 16:35", by: "王丽君", byRole: "manager",
    taskName: "2024-10-08 客诉服务质检", complaintId: "c4", agent: "陈静", user: "机械鲨富大傻俏",
    historyRefs: [{ id: "c4-h1", date: "2024-10-05 20:10:16" }],
    text: "建议总结里固定带上玩家历史情绪走向（上次是否提过投诉、是否激烈），现在要自己翻历史会话才看得出来。",
  },
];

// —— 复审报告 ——
// 「用户新增报告」与「系统生成报告」是两步：用户在弹窗里命名、写备注、勾选任务后新增一条报告记录，
// 系统随后异步生成内容，状态在 生成中 → 已生成 / 生成失败 之间流转，失败可重新生成。
// 报告一经生成即固化：维度/原则建议与统计数字都在生成时快照，之后规则再变也不改动已存报告。
type ReportStatus = "generating" | "failed" | "done";
// 用户在弹窗中提交的部分（报告范围与命名，新增时即确定）。
type ReportDraft = { title: string; note: string; rangeFrom: string; rangeTo: string; taskNames: string[]; ruleVersions: string[] };
// 系统生成出来的部分（生成成功时一次性写入并固化）。
type ReportResult = { complaintCount: number; agreedCount: number; objectionCount: number; dimOps: DimOp[]; principleOps: PrincipleOp[] };
type SavedReport = ReportDraft & ReportResult & {
  id: string;
  status: ReportStatus;
  failReason?: string;
  progress?: number;
  attempts: number;      // 已尝试生成的次数（含首次），> 1 说明经历过重新生成
  failedAt?: string;     // 最近一次失败时刻
  createdAt: string;
  createdBy: string;
  generatedAt?: string;
};

// 依据被质检人员判为「扣分不合理」的规则重新评分：移除这些规则的扣分项，把分数加回。
function rescore(c: Complaint, objectedRules: string[]) {
  const dropped = c.aiIssues.filter(i => objectedRules.includes(i.rule));
  const addBack = dropped.reduce((s, i) => s - (Number(i.score) || 0), 0);
  const newScore = Math.min(100, c.score + addBack);
  const remaining = c.aiIssues.filter(i => !objectedRules.includes(i.rule));
  return { newScore, dropped, remaining };
}

type DimOp = { op: "修改" | "新增" | "删除"; title: string; scope: "通用" | "专用"; catName: string; freq: number; prob: number; standard: string; oldCriteria?: string; newCriteria?: string; score?: string; reason: string };
type PrincipleOp = { op: "新增" | "修改" | "删除"; title: string; oldContent?: string; newContent?: string };

// 在通用/专用门类中定位某个二级维度，返回其归属与当前配置。
function locateDim(title: string, commonCats: Cat[], privateCats: Cat[]): { scope: "通用" | "专用"; catName: string; dim: Dim } | null {
  for (const cat of commonCats) { const d = cat.dimensions.find(x => x.title === title); if (d) return { scope: "通用", catName: cat.name, dim: d }; }
  for (const cat of privateCats) { const d = cat.dimensions.find(x => x.title === title); if (d) return { scope: "专用", catName: cat.name, dim: d }; }
  return null;
}

// 针对高频误扣的维度，给出建议收紧后的判断标准（与规则管理界面一一对应）。
function suggestNewCriteria(title: string, oldCriteria: string): string {
  const map: Record<string, string> = {
    "缺乏耐心": "不扣：全程平和认真，或仅因流程需要多次确认；-2：出现明确不耐烦措辞（如「您已经问过了」「自己看」）、催促结束或推诿。不适用：无多轮追问、对话简短平顺，或客服虽简短但已正面解答。",
    "安抚不到位": "不扣：已针对情绪作出回应，或玩家情绪并不强烈；-2：玩家明确表达强烈不满却完全未安抚。不适用：玩家全程情绪平稳、纯咨询，或问题已当场解决无需额外安抚。",
    "精准答疑": "不扣：直接命中疑问、结论明确，或已如实告知权限外情况、已提交工单/已记录（均视为实质回应）；-2：答了核心但夹带无关文案或需再追问一次；-5：仅复述文案、答非所问且无任何实质回应。玩家提了活动/福利疑问必评。",
  };
  return map[title] ?? (oldCriteria + "；补充边界：仅在明确命中扣分情形时扣分，边界存疑场景默认从宽不扣。");
}

// 结合本次复审，生成对「评分维度」的调整建议：修改（收紧判断标准）／删除（高频全量误扣）／新增（AI 漏扣需补充维度）。
function buildDimOps(complaints: Complaint[], reviews: Record<string, Review>, commonCats: Cat[], privateCats: Cat[]): DimOp[] {
  const freqMap = new Map<string, number>();
  let underScored = false; // 存在人工判分低于 AI（AI 漏扣）
  complaints.forEach(c => {
    const r = reviews[c.id];
    if (!r || r.agreed || !r.submitted) return;
    r.objectedRules.forEach(rule => freqMap.set(rule, (freqMap.get(rule) ?? 0) + 1));
    const sug = Number(r.suggestedScore);
    if (r.suggestedScore.trim() !== "" && !Number.isNaN(sug) && sug < c.score) underScored = true;
  });
  const totalHit = (rule: string) => complaints.filter(c => c.aiIssues.some(i => i.rule === rule)).length;

  const ops: DimOp[] = Array.from(freqMap.entries()).map(([title, freq]) => {
    const loc = locateDim(title, commonCats, privateCats);
    const denom = Math.max(totalHit(title), freq);
    const prob = Math.round((freq / denom) * 100);
    const scope = loc?.scope ?? "通用";
    const catName = loc?.catName ?? "—";
    const standard = loc?.dim.standard ?? "";
    const oldCriteria = loc?.dim.criteria ?? "";
    // 该维度每次触发都被人工推翻（且样本≥2），判定为整体不可靠，建议删除
    if (prob >= 100 && denom >= 2) {
      return { op: "删除" as const, title, scope, catName, freq, prob, standard, oldCriteria, reason: `该维度在本日 ${denom} 次 AI 扣分中被 100% 推翻，属整体误扣，建议从${scope}规则中删除该维度。` };
    }
    return { op: "修改" as const, title, scope, catName, freq, prob, standard, oldCriteria, newCriteria: suggestNewCriteria(title, oldCriteria), reason: "高频误扣，建议收紧判断标准与不适用边界。" };
  });
  // 新增：人工整体判分低于 AI，说明存在 AI 未覆盖的扣分点，建议补充维度
  if (underScored) {
    ops.push({
      op: "新增", title: "响应时效", scope: "通用", catName: "服务态度", freq: 0, prob: 0,
      standard: "客服对玩家消息的响应与跟进是否及时",
      newCriteria: "不扣：全程响应及时、无长时间无回应；-2：出现明显长时间未回应或让玩家反复催促。不适用：玩家未再追问、对话已自然结束。",
      score: "-2",
      reason: "本日存在人工判分低于 AI 的情形，说明 AI 漏扣了响应不及时等问题，建议在「服务态度」下新增该维度。",
    });
  }
  // 排序：修改/删除按存疑概率从高到低，新增置于末尾
  return ops.sort((a, b) => {
    if (a.op === "新增" && b.op !== "新增") return 1;
    if (b.op === "新增" && a.op !== "新增") return -1;
    return b.prob - a.prob || b.freq - a.freq;
  });
}

// 结合本次复审，给出评分原则的新增/修改建议。
function suggestPrincipleOps(principles: Principle[]): PrincipleOp[] {
  const ops: PrincipleOp[] = [];
  const p = principles.find(x => x.title === "不适用即不扣");
  if (p) ops.push({ op: "修改", title: "不适用即不扣", oldContent: p.content, newContent: p.content + " 边界模糊、缺乏明确扣分依据时，一律从宽判为不适用，不扣分。" });
  if (!principles.some(x => x.title === "高频误扣从宽")) {
    ops.push({ op: "新增", title: "高频误扣从宽", newContent: "对复审中被高频推翻的扣分维度，遇到边界或存疑情形默认不扣，避免同类误扣反复出现。" });
  }
  return ops;
}

const COMPLAINTS: Complaint[] = [
  {
    id: "c1",
    agent: "李梦",
    agentType: "一线客服",
    user: "用户01363539162",
    score: 88,
    chat: [
      { from: "user", text: "这个活动的门槛到底是充值满多少？页面写得太绕了。", time: "2024-10-10 10:02:15" },
      { from: "agent", text: "您好，活动规则页面都写着呢，您再仔细看看。", time: "2024-10-10 10:03:02" },
      { from: "user", text: "我看了才来问的，就是没看明白……", time: "2024-10-10 10:04:31" },
      { from: "agent", text: "您已经问过了，规则页面都写着呢。", time: "2024-10-10 10:05:08" },
      { from: "user", text: "行吧。", time: "2024-10-10 10:06:20" },
    ],
    aiIssues: [
      { rule: "缺乏耐心", score: "-2", quote: "「您已经问过了，规则页面都写着呢。」" },
    ],
    history: [
      {
        id: "c1-h0", date: "2024-10-03 22:05:11", demand: "账号异地登录被冻结，反复核验身份并申请解冻，情绪逐渐急躁",
        chat: [
          { from: "user", text: "我账号怎么登不上了？提示异常。", time: "2024-10-03 22:05:11" },
          { from: "agent", text: "您好，您的账号因异地登录触发了安全冻结，需要核验身份后为您解冻。", time: "2024-10-03 22:05:48" },
          { from: "user", text: "异地？我人一直在家啊。", time: "2024-10-03 22:06:20" },
          { from: "agent", text: "可能是网络出口 IP 变动导致的误判，我先帮您核对几项信息。请提供注册手机号后四位。", time: "2024-10-03 22:06:59" },
          { from: "user", text: "8812。", time: "2024-10-03 22:07:33" },
          { from: "agent", text: "收到。请再确认下最近一次充值的大致金额与日期。", time: "2024-10-03 22:08:10" },
          { from: "user", text: "上周充的，好像是 128。", time: "2024-10-03 22:08:52" },
          { from: "agent", text: "信息匹配。为确保是本人操作，我向您手机号发送一个验证码，请查收后告诉我。", time: "2024-10-03 22:09:30" },
          { from: "user", text: "没收到啊。", time: "2024-10-03 22:10:15" },
          { from: "agent", text: "请稍等，可能有延迟，我这边重新发送一次。", time: "2024-10-03 22:10:41" },
          { from: "user", text: "还是没有，你们系统是不是有问题？", time: "2024-10-03 22:12:03" },
          { from: "agent", text: "非常抱歉，短信通道偶有拥堵。我换一种方式，用邮箱验证可以吗？", time: "2024-10-03 22:12:40" },
          { from: "user", text: "可以，快点吧，我还等着上线呢。", time: "2024-10-03 22:13:09" },
          { from: "agent", text: "邮件已发送至您注册邮箱，请查收 6 位验证码。", time: "2024-10-03 22:13:38" },
          { from: "user", text: "收到了，是 402531。", time: "2024-10-03 22:15:02" },
          { from: "agent", text: "验证通过，正在为您提交解冻申请。", time: "2024-10-03 22:15:40" },
          { from: "user", text: "要多久？", time: "2024-10-03 22:16:11" },
          { from: "agent", text: "一般 10 分钟内生效，我会盯着这条工单，生效后第一时间通知您。", time: "2024-10-03 22:16:45" },
          { from: "user", text: "都快半小时了，还不行吗……", time: "2024-10-03 22:35:20" },
          { from: "agent", text: "抱歉让您久等，我刚催了安全组，您的账号已解冻，请重新登录试试。", time: "2024-10-03 22:36:02" },
          { from: "user", text: "行，能进了。", time: "2024-10-03 22:37:18" },
          { from: "agent", text: "为避免后续再次误判，建议您在设置里绑定常用设备，我把入口截图发您。", time: "2024-10-03 22:37:55" },
          { from: "user", text: "好，谢谢。", time: "2024-10-03 22:38:30" },
          { from: "agent", text: "不客气，祝您游戏愉快，有问题随时联系我们。", time: "2024-10-03 22:39:02" },
        ],
      },
      {
        id: "c1-h1", date: "2024-09-28 21:14:07", demand: "咨询活动门槛的充值金额，因页面表述不清反复追问",
        chat: [
          { from: "user", text: "上次那个充值返利，我到底充多少才算达标？", time: "2024-09-28 21:14:07" },
          { from: "agent", text: "您好，达标线是累计充值满 500 元，活动页第二栏有说明，我帮您截图。", time: "2024-09-28 21:15:33" },
          { from: "user", text: "哦好的，这次清楚了，谢谢。", time: "2024-09-28 21:16:12" },
        ],
      },
      {
        id: "c1-h2", date: "2024-09-15 10:41:50", demand: "反馈返利未到账，要求核实订单并加急处理",
        chat: [
          { from: "user", text: "我上个月的返利到现在还没到账。", time: "2024-09-15 10:41:50" },
          { from: "agent", text: "抱歉让您久等，我这边已为您登记工单，预计 24 小时内到账，进度我会同步给您。", time: "2024-09-15 10:43:18" },
          { from: "user", text: "行，麻烦盯一下。", time: "2024-09-15 10:44:05" },
        ],
      },
    ],
    historySummary: {
      handling: {
        demand: "账号被风控判定异地登录冻结，要求尽快解冻恢复登录",
        provided: "已按引导完成常用设备绑定，并提供绑定后的设备列表截图",
        handled: "核实为本人与家属共用账号、非盗号后提交解冻申请，并催办安全组加急",
        status: "已解决，账号 22:36 解冻、玩家确认可正常登录；09-15 返利漏单工单仍无回执，属遗留未闭环项",
      },
      notes: [
        { kind: "risk", text: "账号由本人与其弟共用，异地登录多为家属在外地上号，非盗号；此前按盗号流程重置密码后玩家投诉过一次。再触发风控请先按共用设备核实，不要直接走盗号流程。" },
        { kind: "benefit", text: "09-15 返利漏单已提财务工单，运营称等下一批补发、未给时间；当时口头承诺 24 小时，实际可能兑现不了。" },
      ],
    },
  },
  {
    id: "c2",
    agent: "王浩",
    agentType: "VIP一线客服",
    user: "V2055A",
    score: 72,
    chat: [
      { from: "user", text: "我参加的返利活动怎么没到账？", time: "2024-10-09 14:20:11" },
      { from: "agent", text: "这个我之前说过了，您再看看活动页面吧。", time: "2024-10-09 14:21:40" },
      { from: "user", text: "我等了两天了，很着急，能不能帮我查一下！", time: "2024-10-09 14:22:19" },
      { from: "agent", text: "好的好的，您稍等。", time: "2024-10-09 14:23:05" },
      { from: "user", text: "……你们到底管不管？", time: "2024-10-09 14:30:47" },
    ],
    aiIssues: [
      { rule: "缺乏耐心", score: "-2", quote: "「这个我之前说过了，您再看看活动页面吧。」" },
      { rule: "安抚不到位", score: "-2", quote: "「好的好的，您稍等。」（玩家明显不满，未作安抚）" },
    ],
    history: [
      {
        id: "c2-h1", date: "2024-10-02 19:30:22", demand: "VIP 专属礼包无法领取，要求排查账号权限",
        chat: [
          { from: "user", text: "我的 VIP 礼包点了领取没反应。", time: "2024-10-02 19:30:22" },
          { from: "agent", text: "已为您核实，是活动缓存延迟，我这边手动为您补发，请稍后查收邮件。", time: "2024-10-02 19:33:41" },
          { from: "user", text: "收到了，效率不错。", time: "2024-10-02 19:36:09" },
        ],
      },
      {
        id: "c2-h2", date: "2024-09-20 15:02:33", demand: "询问返利活动的结算周期与到账方式",
        chat: [
          { from: "user", text: "返利一般几天到？", time: "2024-09-20 15:02:33" },
          { from: "agent", text: "活动结束后 3 个工作日内结算，直接发放到游戏内钻石余额。", time: "2024-09-20 15:03:50" },
        ],
      },
    ],
    historySummary: {
      handling: {
        demand: "VIP 专属礼包点击领取无反应，要求排查账号权限",
        provided: "已提供游戏内角色 ID 与所在区服、领取失败录屏",
        handled: "核实为活动缓存延迟，由 VIP 专员手动权限补发礼包（运营特批，未对玩家提及）",
        status: "已解决，玩家 19:36 确认收到并认可处理效率",
      },
      notes: [
        { kind: "benefit", text: "VIP 专属客服对接用户；10-02 VIP 专属礼包已由专员手动权限补发，走的运营特批，玩家不知道这一层。本月福利申请额度已用完。" },
        { kind: "risk", text: "该用户对权益时效敏感，两次进线均为权益类，被「稍等」一类模糊回复后语气会明显转硬。" },
      ],
    },
    workOrder: {
      id: "774920318",
      fields: [
        { label: "ID", value: "774920318" },
        { label: "对接", value: "774920318" },
        { label: "联系方式", value: "13802991174" },
        { label: "手机型号", value: "PGT-AN10" },
        { label: "游戏版本", value: "Android_5.11_tyGuest,ysdk.ysdk.0-hall28.qqqm.bydzz" },
        { label: "充值时间", value: "2024.10.07 21:15:03" },
        { label: "充值金额及物品", value: "648元 · 至尊礼包" },
        { label: "总充值金额", value: "12860元" },
        { label: "问题描述", value: "参加返利活动，返利未到账" },
      ],
      attachments: ["活动页面截图.png", "返利规则.png"],
      uid: "V2055A",
      status: "已完成",
      watchers: ["王哲"],
      logs: [
        { by: "曾珂", at: "2024-10-08 21:46:31", text: "已核实返利已发放至游戏内钻石余额，工单关闭。" },
        { by: "荣鑫", at: "2024-10-07 19:57:32", text: "2024/10/7 下午7:54:24 已补，已 AI 回复。" },
        { by: "系统", at: "2024-10-07 19:53:10", text: "客服提交工单：参加返利活动，返利未到账。" },
      ],
    },
  },
  {
    id: "c3",
    agent: "李梦",
    agentType: "一线客服",
    user: "大有可为双鱼座",
    score: 95,
    chat: [
      { from: "user", text: "请问新手礼包在哪里领？", time: "2024-10-08 09:10:14" },
      { from: "agent", text: "您好，进入游戏后点击右上角「福利」→「新手礼包」即可一键领取，已为您截图标注。", time: "2024-10-08 09:11:02" },
      { from: "user", text: "找到了，谢谢！", time: "2024-10-08 09:12:37" },
    ],
    aiIssues: [],
  },
  {
    id: "c4",
    agent: "陈静",
    agentType: "高潜客服",
    user: "机械鲨富大傻俏",
    score: 61,
    chat: [
      { from: "user", text: "我充值了但是钻石没到账，钱也扣了！", time: "2024-10-11 20:41:09" },
      { from: "agent", text: "这是系统问题，我这边无法处理。", time: "2024-10-11 20:42:25" },
      { from: "user", text: "那我找谁？钱不能白扣啊。", time: "2024-10-11 20:43:52" },
    ],
    aiIssues: [
      { rule: "安抚不到位", score: "-2", quote: "「这是系统问题，我这边无法处理。」（随即结束对话）" },
    ],
    history: [
      {
        id: "c4-h1", date: "2024-10-05 20:10:16", demand: "充值扣款但钻石未到账，要求追回并说明处理时限",
        chat: [
          { from: "user", text: "我昨天充的钻石还是没到，钱扣了。", time: "2024-10-05 20:10:16" },
          { from: "agent", text: "非常抱歉给您带来困扰，已为您提交财务核账工单，48 小时内到账，若超时可申请全额退款。", time: "2024-10-05 20:12:44" },
          { from: "user", text: "那我等等看吧。", time: "2024-10-05 20:13:29" },
        ],
      },
    ],
    historySummary: {
      handling: {
        demand: "充值扣款但钻石未到账，要求追回并说明处理时限",
        provided: "已提供支付成功截图（含扣款记录）、充值时间与金额；渠道单号玩家侧查不到，未取得",
        handled: "已提交财务核账工单，口头承诺 48 小时内到账、超时可申请全额退款",
        status: "处理中，暂无明确结果——渠道订单号查不到，需等渠道对账日；48 小时时限与全额退款承诺均未获财务确认",
      },
      notes: [
        { kind: "risk", text: "玩家自述近期充值超出承受范围、已有负债，对扣款异常反应激烈，10-05 曾提到「再不解决就去投诉」。" },
        { kind: "benefit", text: "该笔充值走第三方渠道、渠道单号查不到，财务需等对账日确认；当时口头给的 48 小时与「超时全额退款」均未获财务审批。" },
      ],
    },
    workOrder: {
      id: "831461461",
      fields: [
        { label: "ID", value: "831461461" },
        { label: "对接", value: "831461461" },
        { label: "联系方式", value: "15697072547" },
        { label: "手机型号", value: "LYA-AL00" },
        { label: "游戏版本", value: "Android_5.11_tyGuest,ysdk.ysdk.0-hall28.qqqm.bydzz" },
        { label: "充值时间", value: "2024.10.11 20:38:12" },
        { label: "充值金额及物品", value: "6元" },
        { label: "总充值金额", value: "55元" },
        { label: "问题描述", value: "充值未到" },
      ],
      attachments: ["充值订单截图.png"],
      uid: "",
      status: "处理中",
      watchers: [],
      logs: [
        { by: "陈静", at: "2024-10-11 20:44:10", text: "已提交财务核账，等待订单流水核对结果。" },
        { by: "系统", at: "2024-10-11 20:43:55", text: "客服提交工单：充值未到账，附扣费截图。" },
      ],
    },
  },
];

// 质检任务种子。complaintIds = 任务创建时锁定纳入的客诉；「查看报告」据此判断该任务是否已审完。
const SEED_TASKS: TaskRow[] = [
  { name: "2024-10-11 客诉服务质检", status: "已完成", note: "十月第二周", date: "2024-10-11", ruleVersion: "v31", complaintIds: ["c1", "c2", "c3", "c4"] },
  { name: "2024-10-10 客诉服务质检", status: "有异常", note: "AI 检查中断", date: "2024-10-10", ruleVersion: "v30", complaintIds: ["c1", "c2", "c3", "c4"] },
  { name: "2024-10-09 客诉服务质检", status: "打分中", note: "十月第二周", date: "2024-10-09", ruleVersion: "v29", complaintIds: ["c2", "c3"] },
  { name: "2024-10-08 客诉服务质检", status: "已完成", note: "十月第一周复盘", date: "2024-10-08", ruleVersion: "v28", complaintIds: ["c3", "c4"] },
  { name: "2024-10-07 客诉服务质检", status: "已完成", note: "十月第一周", date: "2024-10-07", ruleVersion: "v27", complaintIds: ["c4"] },
];

// 已完成复审的种子记录：10-11 任务的 c1~c4 已全部审完，10-08 / 10-07 任务也已审完，均可直接纳入报告；
// 未审完的场景由 10-10（AI 异常）与 10-09（打分中）两个任务演示。
const SEED_REVIEWS: Record<string, Review> = {
  c1: { agreed: true, submitted: false, objectedRules: [], reran: false, suggestedScore: "", detail: "", agentNote: "", deductedRules: [] },
  c2: {
    agreed: false, submitted: true, objectedRules: ["缺乏耐心"], reran: false,
    suggestedScore: "78", detail: "玩家已两次追问同一问题，客服的重复指引属于合理引导，不宜按「缺乏耐心」扣分；但对方情绪明显不满时确实缺少安抚。",
    agentNote: "对 VIP 玩家的权益类诉求应主动给出确定的到账时间，避免只让玩家「稍等」。", deductedRules: ["安抚不到位"],
  },
  c3: { agreed: true, submitted: false, objectedRules: [], reran: false, suggestedScore: "", detail: "", agentNote: "", deductedRules: [] },
  c4: {
    agreed: false, submitted: true, objectedRules: ["安抚不到位"], reran: false,
    suggestedScore: "63", detail: "玩家情绪虽有不满，但客服已如实说明权限范围，「安抚不到位」在本场景属边界情形，不应直接扣分。",
    agentNote: "已如实告知处理边界，但未给出后续跟进路径，建议下次补充工单进度说明。", deductedRules: ["安抚不到位"],
  },
};

// 新增任务的筛选条件可选项。
// 客诉标签本身有包含关系，按一级/二级两层组织：一级是大类，二级是该大类下的具体标签。
// 选中一级 = 该大类本身的标签 + 其下全部二级标签；也可以展开一级只勾选其中几个二级标签。
// 注意：几个大类（退费类/性能问题/发票类/充值类）自身也是一个可落到客诉上的标签，
// 这里不把它重复列进二级，而是由「选中一级」时连同一级名称一起带上。
const TAG_TREE: { level1: string; level2: string[] }[] = [
  { level1: "打不死鱼", level2: ["BOSS被抢", "充值无体验", "特定BOSS", "质疑针对", "长期无爆率", "吐槽打不死鱼", "遗留打不死鱼"] },
  { level1: "咨询类", level2: ["活动/玩法咨询", "礼包/付费咨询", "游戏设置咨询", "免费福利/添加咨询"] },
  { level1: "VIP类", level2: ["福利申请", "修改昵称", "VIP添加", "H5链接充值", "VIP相关", "遗留VIP添加", "遗留福利申请"] },
  { level1: "账号类", level2: ["账号咨询", "无法登录", "账号封禁", "账号绑定", "账号找回", "账号注销", "临时验证码"] },
  { level1: "退费类", level2: ["未成年退费", "申请退费"] },
  { level1: "性能问题", level2: ["卡顿/延迟", "闪退/崩溃"] },
  { level1: "发票类", level2: ["发票申请"] },
  { level1: "充值类", level2: ["充值未到账", "无法充值", "充值问题", "充值到账错误"] },
];
const DEFAULT_INCLUDE_GROUPS = ["咨询类", "打不死鱼", "VIP类", "账号类"];
const DEFAULT_INCLUDE_TAGS = TAG_TREE.filter(g => DEFAULT_INCLUDE_GROUPS.includes(g.level1)).flatMap(g => [g.level1, ...g.level2]);
const DEFAULT_EXCLUDE_TAGS = ["无效会话"];
const COMPLAINT_STATUS_OPTIONS = ["已回复", "待回复", "已完成", "新客诉", "已解决", "已回绝"];
const VIP_LEVELS = ["0", "1", "2", "3", "4", "5", "6"];
// 新建任务时按客服分组选择客服姓名：一级为分组，二级为该分组下的客服姓名。AI客服无具体姓名。
const AGENT_ROSTER: { group: string; names: string[] }[] = [
  { group: "一线客服", names: ["李梦", "王晨", "申慧"] },
  { group: "VIP一线客服", names: ["王浩", "刘滔"] },
  { group: "高潜客服", names: ["陈静", "罗晶晶"] },
  { group: "VIP客服", names: ["王丽君", "阳尹新"] },
  { group: "AI客服", names: [] },
];

function PluginSidebar({
  view,
  setView,
  currentUser,
  messages,
  pendingFeedback,
  onLogout,
}: {
  view: View;
  setView: (view: View) => void;
  currentUser: Account;
  messages: Message[];
  pendingFeedback: number;
  onLogout: () => void;
}) {
  const isAgent = currentUser.role === "agent";
  const isAdmin = currentUser.role === "admin";
  const unread = unreadCount(messages, currentUser);
  const MsgBtn = (
    <button
      onClick={() => setView("messages")}
      className={`relative mb-1 flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "messages" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
    >
      <Inbox className="size-4" />
      消息
      {unread > 0 && <span className="ml-auto grid min-w-4 place-items-center rounded-full bg-[#e0645f] px-1 text-[9px] font-semibold text-white">{unread}</span>}
    </button>
  );
  return (
    <aside className="flex w-[184px] shrink-0 flex-col bg-[#293542] px-3 py-4 text-[#c5ced8]">
      <div className="mb-7 flex items-center gap-2 px-2">
        <div className="grid size-8 place-items-center rounded-lg bg-[#4d82f6] text-white">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <div className="text-[13px] font-semibold text-white">
            质检助手
          </div>
          <div className="text-[10px] text-[#9eabb9]">
            Quality Assistant
          </div>
        </div>
      </div>
      <div className="mb-2 px-2 text-[10px] font-medium tracking-[0.12em] text-[#8896a4]">
        工作台
      </div>
      {isAgent ? (
        <>
          <button
            onClick={() => setView("records")}
            className={`mb-1 flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "records" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
          >
            <UserRound className="size-4" />
            个人记录
          </button>
          {MsgBtn}
        </>
      ) : (
        <>
          <button
            onClick={() => setView("quality")}
            className={`mb-1 flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "quality" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
          >
            <ClipboardCheck className="size-4" />
            任务管理
          </button>
          <button
            onClick={() => setView("rules")}
            className={`mb-1 flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "rules" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
          >
            <SlidersHorizontal className="size-4" />
            规则设置
          </button>
          {MsgBtn}
          {isAdmin && (
            <>
              <button
                onClick={() => setView("feedback")}
                className={`relative mb-1 flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "feedback" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
              >
                <MessageSquareWarning className="size-4" />
                总结反馈
                {pendingFeedback > 0 && <span className="ml-auto grid min-w-4 place-items-center rounded-full bg-[#e0645f] px-1 text-[9px] font-semibold text-white">{pendingFeedback}</span>}
              </button>
              <button
                onClick={() => setView("reports")}
                className={`mb-1 flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "reports" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
              >
                <FileText className="size-4" />
                查看报告
              </button>
              <button
                onClick={() => setView("members")}
                className={`flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "members" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
              >
                <UserRound className="size-4" />
                用户管理
              </button>
            </>
          )}
        </>
      )}
      <div className="mt-auto border-t border-[#465361] pt-3">
        <div className="flex items-center gap-2 px-1">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#4d82f6] text-[13px] font-semibold text-white">
            {currentUser.name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-medium text-white">{currentUser.name}</div>
            <div className="text-[10px] text-[#9eabb9]">{roleLabel(currentUser.role)}</div>
          </div>
          <button onClick={onLogout} title="退出登录" className="grid size-7 shrink-0 place-items-center rounded-md text-[#9eabb9] hover:bg-[#354454] hover:text-white">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function QualityHome({ commonCats, privateCats, complaints, aiVersion, currentRuleVersion, rerunTask, openTaskName, setOpenTaskName, openComplaintId, setOpenComplaintId, reviews, setReviews, excellentCases, markExcellent, unmarkExcellent, tasks, setTasks, onGoToRuleView, canFeedback, onSummaryFeedback }: { commonCats: Cat[]; privateCats: Cat[]; complaints: Complaint[]; aiVersion: number; currentRuleVersion: string; rerunTask: () => void; openTaskName: string | null; setOpenTaskName: (name: string | null) => void; openComplaintId: string | null; setOpenComplaintId: (id: string | null) => void; reviews: Record<string, Review>; setReviews: React.Dispatch<React.SetStateAction<Record<string, Review>>>; excellentCases: ExcellentCase[]; markExcellent: (c: Complaint) => void; unmarkExcellent: (complaintId: string) => void; tasks: TaskRow[]; setTasks: React.Dispatch<React.SetStateAction<TaskRow[]>>; onGoToRuleView: (name: string) => void; canFeedback: boolean; onSummaryFeedback: (taskName: string, c: Complaint, text: string) => void }) {
  const detailTask = openTaskName ? tasks.find(t => t.name === openTaskName) ?? null : null;
  const setDetailTask = (task: TaskRow | null) => setOpenTaskName(task ? task.name : null);
  // 本任务纳入的客诉（任务创建时锁定的范围），任务详情与报告口径均以此为准。
  const taskComplaints = detailTask ? complaints.filter(c => detailTask.complaintIds.includes(c.id)) : complaints;
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editingCell, setEditingCell] = useState<{ name: string; field: "name" | "note" } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [showNewTask, setShowNewTask] = useState(false);
  const [ranToast, setRanToast] = useState(false);
  // 客诉评分细节筛选：配置驱动。加一列筛选 = 往 detailFilters 加一条配置，无需改 UI 或过滤逻辑。
  // type: "select" 渲染下拉；"segment" 渲染分段按钮。options 可为静态数组或按客诉列表动态求值。
  type DetailFilter = {
    key: string;
    label: string;
    type: "select" | "segment";
    options: string[] | ((rows: Complaint[]) => string[]);
    match: (c: Complaint, value: string) => boolean;
  };
  const detailFilters: DetailFilter[] = [
    { key: "agent", label: "客服", type: "select",
      options: rows => Array.from(new Set(rows.map(c => c.agent))),
      match: (c, v) => c.agent === v },
    { key: "agentType", label: "客服类型", type: "select",
      options: rows => Array.from(new Set(rows.map(c => c.agentType))),
      match: (c, v) => c.agentType === v },
    { key: "status", label: "审核状态", type: "segment",
      options: ["已审", "未审"],
      match: (c, v) => (v === "已审" ? isReviewed(c) : !isReviewed(c)) },
  ];
  // 每个筛选的当前取值（""=不限）。
  const [detailFilterValues, setDetailFilterValues] = useState<Record<string, string>>({});
  const setDetailFilter = (key: string, value: string) => setDetailFilterValues(prev => ({ ...prev, [key]: value }));

  function runTask(task: TaskRow) {
    setTasks(prev => prev.map(t => t.name === task.name ? { ...t, status: "拉取中" } : t));
    rerunTask();
    setTasks(prev => prev.map(t => t.name === task.name ? { ...t, status: "已完成" } : t));
    setRanToast(true);
  }

  function deleteTask(task: TaskRow) {
    setTasks(prev => prev.filter(t => t.name !== task.name));
    if (openTaskName === task.name) setOpenTaskName(null);
  }

  function createTask(t: Omit<TaskRow, "ruleVersion" | "complaintIds">) {
    // 任务创建时锁定当前生效的规则版本与纳入的客诉范围，之后规则再改也不影响本任务的打分与报告口径。
    setTasks(prev => [{ ...t, ruleVersion: currentRuleVersion, complaintIds: complaints.map(c => c.id) }, ...prev]);
    setShowNewTask(false);
  }

  function startEdit(task: TaskRow, field: "name" | "note") {
    setEditingCell({ name: task.name, field });
    setEditingValue(field === "name" ? task.name : task.note);
  }
  function commitEdit(task: TaskRow) {
    if (!editingCell) return;
    setTasks(prev => prev.map(t => t.name === task.name
      ? editingCell.field === "name"
        ? { ...t, name: editingValue.trim() || t.name }
        : { ...t, note: editingValue }
      : t
    ));
    if (editingCell.field === "name" && detailTask?.name === task.name) {
      setOpenTaskName(editingValue.trim() || task.name);
    }
    setEditingCell(null);
  }

  const filteredTasks = tasks.filter(t => {
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  });

  const openComplaint = openComplaintId ? complaints.find(c => c.id === openComplaintId) ?? null : null;
  if (detailTask && openComplaint) {
    return (
      <ConversationReview
        complaint={openComplaint}
        review={reviews[openComplaint.id] ?? null}
        commonCats={commonCats}
        privateCats={privateCats}
        isExcellent={excellentCases.some(e => e.complaintId === openComplaint.id)}
        onToggleExcellent={(c) => excellentCases.some(e => e.complaintId === c.id) ? unmarkExcellent(c.id) : markExcellent(c)}
        onBack={() => setOpenComplaintId(null)}
        onSave={(r) => setReviews(prev => ({ ...prev, [openComplaint.id]: r }))}
        onGoToRule={onGoToRuleView}
        canFeedback={canFeedback}
        onSummaryFeedback={(c, text) => onSummaryFeedback(detailTask.name, c, text)}
      />
    );
  }

  const finalScore = (c: Complaint) => {
    const r = reviews[c.id];
    if (r && !r.agreed && r.submitted && r.suggestedScore.trim() !== "" && !Number.isNaN(Number(r.suggestedScore))) {
      return Number(r.suggestedScore);
    }
    return c.score;
  };
  // 复审完成 = 认可，或已「提交异议」；仅存草稿（有异议未提交）不算完成。
  const isReviewed = (c: Complaint) => { const r = reviews[c.id]; return !!r && (r.agreed || r.submitted); };
  const allReviewed = taskComplaints.every(isReviewed);

  if (detailTask) {
    // 人工审核后仍认可的扣分项：AI 扣分中未被异议撤销的规则（agreed 则全部保留）。
    const agreedDeductions = (c: Complaint) => {
      const r = reviews[c.id];
      if (r && !r.agreed) return c.aiIssues.filter(i => !r.objectedRules.includes(i.rule));
      return c.aiIssues;
    };
    // 备注：认可 AI 时展示 AI 评分明细（各扣分项及依据）；有异议时取人工对客服的评分备注。
    const reviewNote = (c: Complaint) => {
      const r = reviews[c.id];
      if (!r) return "";
      if (r.agreed) {
        if (c.aiIssues.length === 0) return "AI 判定本次会话无扣分，表现良好。";
        return c.aiIssues.map(i => `${i.rule}（${i.score}）：${i.quote}`).join("\n");
      }
      return r.agentNote?.trim() || "—";
    };
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
        <header className="flex h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setDetailTask(null)} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
              <ChevronRight className="size-3 rotate-180" />返回
            </button>
            <div>
              <h1 className="text-[15px] font-semibold text-[#2f3b48]">{detailTask.name}</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#8b96a3]">
                {detailTask.status === "已完成" ? "AI 自动质检已完成，请逐条复审客诉；全部复审后展示客服得分汇总。" : "本次 AI 自动质检异常，请在列表中重启任务。"}
                <span className="inline-flex items-center rounded-full border border-[#dbe4f2] bg-[#f4f8ff] px-1.5 py-0.5 text-[9px] font-medium text-[#3d6fe0]" title="本任务创建时锁定的规则版本，打分与报告均以此版本为准">适用规则 {detailTask.ruleVersion}</span>
                {detailTask.status === "已完成" && (
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${aiVersion > 1 ? "bg-[#eef4ff] text-[#4b7ff0]" : "bg-[#f0f2f5] text-[#98a3af]"}`}>AI 评分 v{aiVersion}{aiVersion > 1 ? "（已采纳复审意见）" : ""}</span>
                )}
              </p>
            </div>
          </div>
          {detailTask.status === "已完成" && allReviewed && (
            <button className="flex items-center gap-1 rounded border border-[#d9e2ee] bg-white px-2 py-1 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
              <Download className="size-3" />导出 XLSX
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {detailTask.status === "已完成" && allReviewed && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#cfe6d9] bg-[#eef8f2] px-4 py-2.5 text-[11px] text-[#27955d]">
              <ClipboardCheck className="size-4 shrink-0" />
              <span>本任务所有客诉已审核完毕，可在「查看报告」中将本任务纳入报告范围（需超级管理员权限）。</span>
            </div>
          )}
          <div className="overflow-hidden rounded-lg border border-[#dce6f4] bg-white">
            {detailTask.status === "已完成" ? (
              <div>
                {/* 客服得分汇总 */}
                <div className="border-b border-[#e9edf0] px-4 pb-3 pt-3">
                  <div className="mb-2 text-[11px] font-semibold text-[#374350]">客服得分汇总</div>
                  {allReviewed ? (
                    <div className="overflow-x-auto">
                      <div style={{ minWidth: "760px" }}>
                        <div className="grid grid-cols-[70px_120px_84px_1.4fr_64px_1.4fr] bg-[#f5f8fc] px-3 py-1.5 text-[10px] text-[#8b97a3]">
                          <span>姓名</span><span>客诉ID</span><span>日期</span><span>质检失分维度</span><span>总分</span><span>备注</span>
                        </div>
                        {taskComplaints.map(c => {
                          const kept = agreedDeductions(c);
                          const shown = finalScore(c);
                          return (
                            <div key={c.id} className="grid grid-cols-[70px_120px_84px_1.4fr_64px_1.4fr] items-start border-t border-[#eef1f4] px-3 py-2.5 text-[10px]">
                              <span className="font-medium text-[#3e4c5a]">{c.agent}</span>
                              <span className="truncate text-[#6b7a89]" title={c.id}>{c.id}</span>
                              <span className="text-[#758291]">{detailTask.date}</span>
                              <span className="flex flex-wrap gap-1">
                                {kept.length > 0 ? kept.map((it, i) => (
                                  <span key={i} className="rounded bg-[#fff0f0] px-1.5 py-0.5 text-[9px] text-[#d75d5d]">{it.rule} {it.score}</span>
                                )) : <span className="text-[#98a3af]">无扣分</span>}
                              </span>
                              <span className={`font-semibold ${shown >= 90 ? "text-[#27955d]" : shown >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]"}`}>{shown}</span>
                              <span className="whitespace-pre-line leading-relaxed text-[#6b7a89]">{reviewNote(c)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md bg-[#f7f9fb] px-3 py-3 text-[10px] leading-relaxed text-[#8b96a3]">
                      需完成全部 {taskComplaints.length} 条客诉复审后，才会按最终确认得分计算并展示客服得分汇总。当前已复审 {taskComplaints.filter(isReviewed).length}/{taskComplaints.length} 条。
                    </div>
                  )}
                </div>

                {/* 客诉评分细节 */}
                <div className="px-4 pb-4 pt-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-[#374350]">客诉评分细节</span>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      {detailFilters.map(f => {
                        const opts = typeof f.options === "function" ? f.options(taskComplaints) : f.options;
                        const val = detailFilterValues[f.key] ?? "";
                        if (f.type === "segment") {
                          return (
                            <div key={f.key} className="flex rounded-md border border-[#e2e8f0] bg-[#f5f7fa] p-0.5">
                              <button onClick={() => setDetailFilter(f.key, "")}
                                className={`rounded px-2 py-1 text-[10px] font-medium transition ${val === "" ? "bg-white text-[#4b7ff0] shadow-sm" : "text-[#8b97a3] hover:text-[#5a6572]"}`}>全部</button>
                              {opts.map(o => (
                                <button key={o} onClick={() => setDetailFilter(f.key, o)}
                                  className={`rounded px-2 py-1 text-[10px] font-medium transition ${val === o ? "bg-white text-[#4b7ff0] shadow-sm" : "text-[#8b97a3] hover:text-[#5a6572]"}`}>{o}</button>
                              ))}
                            </div>
                          );
                        }
                        return (
                          <select key={f.key} value={val} onChange={e => setDetailFilter(f.key, e.target.value)}
                            className="h-7 rounded-md border border-[#dbe3ee] bg-white px-2 text-[10px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]">
                            <option value="">全部{f.label}</option>
                            {opts.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        );
                      })}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: "820px" }}>
                      <div className="grid grid-cols-[70px_96px_120px_64px_120px_88px_72px] bg-[#f5f8fc] px-3 py-1.5 text-[10px] text-[#8b97a3]">
                        <span>客服</span><span>客服类型</span><span>用户名</span><span>评分结果</span><span>客服处理完成日期</span><span>复审会话</span><span>审核状态</span>
                      </div>
                      <div className="max-h-[420px] overflow-y-auto">
                        {(() => {
                          const detailRows = taskComplaints.filter(c =>
                            detailFilters.every(f => {
                              const v = detailFilterValues[f.key] ?? "";
                              return v === "" || f.match(c, v);
                            })
                          );
                          if (detailRows.length === 0) return (
                            <div className="px-3 py-8 text-center text-[10px] text-[#b0bbc8]">没有符合筛选条件的客诉</div>
                          );
                          return detailRows.map((row) => {
                          const reviewed = isReviewed(row);
                          const shown = finalScore(row);
                          const changed = shown !== row.score;
                          return (
                            <div key={row.id} className="grid grid-cols-[70px_96px_120px_64px_120px_88px_72px] items-center border-t border-[#eef1f4] px-3 py-2.5 text-[10px]">
                              <span className="font-medium text-[#465260]">{row.agent}</span>
                              <span className="truncate text-[#6b7a89]" title={row.agentType}>{row.agentType}</span>
                              <span className="truncate text-[#6b7a89]" title={row.user}>{row.user}</span>
                              <span className="flex items-baseline gap-1">
                                <span className={`font-semibold ${shown >= 90 ? "text-[#27955d]" : shown >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]"}`}>{shown}分</span>
                                {changed && <span className="text-[9px] text-[#98a3af] line-through">{row.score}</span>}
                              </span>
                              <span className="text-[#758291]">{detailTask.date}</span>
                              <div>
                                <button onClick={() => setOpenComplaintId(row.id)} className="inline-flex items-center gap-0.5 rounded border border-[#dbe3ee] px-1.5 py-0.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
                                  <SlidersHorizontal className="size-2.5" />查看链接
                                </button>
                              </div>
                              <div>
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${reviewed ? "bg-[#e6f4ee] text-[#27955d]" : "bg-[#f0f2f5] text-[#98a3af]"}`}>
                                  <span className={`size-1.5 rounded-full ${reviewed ? "bg-[#34a36a]" : "bg-[#c0c8d0]"}`} />
                                  {reviewed ? "已审" : "未审"}
                                </span>
                              </div>
                            </div>
                          );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-5">
                <div className="mb-3 grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-[#f7f9fb] px-3 py-2.5">
                    <div className="text-[10px] text-[#8b97a3]">任务状态</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-[#d75d5d]" />
                      <span className="text-[11px] font-medium text-[#d75d5d]">AI 质检异常</span>
                    </div>
                  </div>
                  <div className="rounded-md bg-[#f7f9fb] px-3 py-2.5">
                    <div className="text-[10px] text-[#8b97a3]">质检日期</div>
                    <div className="mt-1 text-[11px] font-medium text-[#465260]">{detailTask.date}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-md border border-[#e8edf2] bg-[#fafbfc] px-3 py-2.5 text-[10px] text-[#8b97a3]">
                  <span>本次自动质检未能完成，请返回列表点击「重启任务」重新运行。</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5">
        <div>
          <h1 className="text-[15px] font-semibold text-[#2f3b48]">任务管理</h1>
          <p className="mt-0.5 text-[10px] text-[#8b96a3]">AI 于非工作时间自动质检，工作时间查看每日质检结果</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#8b97a3]">时间区间</span>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-7 rounded border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]"
          />
          <span className="text-[10px] text-[#b0bbc8]">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-7 rounded border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-[10px] text-[#a0acb8] hover:text-[#d75d5d]"
            >
              <X className="size-3.5" />
            </button>
          )}
          <button
            onClick={() => setShowNewTask(true)}
            className="ml-1 flex h-7 items-center gap-1 rounded-md bg-[#4b7ff0] px-2.5 text-[11px] font-medium text-white hover:bg-[#3f72e0]"
          >
            <Plus className="size-3.5" />新增任务
          </button>
        </div>
      </header>

      {showNewTask && <NewTaskModal onClose={() => setShowNewTask(false)} onCreate={createTask} />}

        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="space-y-3">
            {ranToast && (
              <div className="flex items-start gap-2 rounded-lg border border-[#cfe6d9] bg-[#eef8f2] px-4 py-2.5 text-[11px] leading-relaxed text-[#27955d]">
                <RefreshCw className="mt-0.5 size-4 shrink-0" />
                <span>AI 已按最新规则重新为各条客诉打分（当前 AI 评分 v{aiVersion}）；已提交人工复审的客诉，其意见与分数完整保留。点「复核结果」查看变化。</span>
                <button onClick={() => setRanToast(false)} className="ml-auto text-[#7fae95] hover:text-[#27955d]"><X className="size-3.5" /></button>
              </div>
            )}
            <div className="overflow-hidden rounded-lg border border-[#e1e6eb] bg-white">
              <div className="border-b border-[#e9edf0] px-4 py-3">
                <div className="text-[12px] font-semibold text-[#374350]">自动质检任务列表</div>
                <div className="mt-0.5 text-[10px] text-[#8b97a3]">每日 AI 自动质检生成；已完成可复核结果，异常可重启任务</div>
              </div>
              {filteredTasks.length === 0 ? (
                <div className="px-4 py-8 text-center text-[11px] text-[#b0bbc8]">{(dateFrom || dateTo) ? "所选时间区间内暂无质检任务" : "暂无质检任务"}</div>
              ) : (
                <div className="overflow-x-auto">
                  <div style={{ minWidth: "720px" }}>
                    <div className="grid grid-cols-[1.6fr_1fr_.8fr_.7fr_.9fr_180px] bg-[#fafbfc] px-4 py-2 text-[10px] text-[#8b97a3]">
                      <span>任务名称</span><span>备注</span><span>日期</span><span>适用规则版本</span><span>状态</span><span>操作</span>
                    </div>
                    <div className="max-h-[228px] overflow-y-auto">
                      {filteredTasks.map(task => {
                        const editingName = editingCell?.name === task.name && editingCell.field === "name";
                        const editingNote = editingCell?.name === task.name && editingCell.field === "note";
                        return (
                          <div key={task.name} className="grid grid-cols-[1.6fr_1fr_.8fr_.7fr_.9fr_180px] items-center border-t border-[#edf0f3] px-4 py-2.5 text-left text-[11px] transition hover:bg-[#f8fbff]">
                            {editingName ? (
                              <input autoFocus value={editingValue} onChange={e => setEditingValue(e.target.value)}
                                onBlur={() => commitEdit(task)} onKeyDown={e => { if (e.key === "Enter") commitEdit(task); if (e.key === "Escape") setEditingCell(null); }}
                                className="h-6 w-full rounded border border-[#4b7ff0] bg-white px-2 text-[11px] font-medium outline-none" />
                            ) : (
                              <span className="cursor-text font-medium text-[#465260] hover:text-[#4b7ff0]" onClick={() => startEdit(task, "name")} title="点击编辑">{task.name}</span>
                            )}
                            {editingNote ? (
                              <input autoFocus value={editingValue} onChange={e => setEditingValue(e.target.value)}
                                onBlur={() => commitEdit(task)} onKeyDown={e => { if (e.key === "Enter") commitEdit(task); if (e.key === "Escape") setEditingCell(null); }}
                                className="h-6 w-full rounded border border-[#4b7ff0] bg-white px-2 text-[10px] outline-none" />
                            ) : (
                              <span className="cursor-text" onClick={() => startEdit(task, "note")} title="点击编辑">
                                {task.note ? <i className="rounded bg-[#f0f4fa] px-1.5 py-0.5 not-italic text-[10px] text-[#687789] hover:bg-[#e8eef8]">{task.note}</i> : <span className="text-[10px] text-[#c5cdd6] hover:text-[#8b97a3]">+ 添加备注</span>}
                              </span>
                            )}
                            <span className="text-[#758291]">{task.date}</span>
                            <span>
                              <span className="inline-flex items-center rounded-full border border-[#dbe4f2] bg-[#f4f8ff] px-2 py-0.5 text-[10px] font-medium text-[#3d6fe0]" title="任务创建时锁定的规则版本，打分与报告均以此版本为准">{task.ruleVersion}</span>
                            </span>
                            <span>
                              {(() => {
                                const st = task.status;
                                if (st === "拉取中" || st === "打分中") return (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-[#eef4ff] px-2 py-0.5 text-[10px] font-medium text-[#4b7ff0]">
                                    <RefreshCw className="size-2.5 animate-spin" />{st}
                                  </span>
                                );
                                if (st === "有异常") return (
                                  <span className="inline-flex items-center rounded-full bg-[#fdeeee] px-2 py-0.5 text-[10px] font-medium text-[#d75d5d]">有异常</span>
                                );
                                return (
                                  <span className="inline-flex items-center rounded-full bg-[#eaf7f0] px-2 py-0.5 text-[10px] font-medium text-[#27955d]">已完成</span>
                                );
                              })()}
                            </span>
                            <div className="flex items-center justify-start gap-1.5">
                              {task.status === "有异常" ? (
                                <button onClick={() => runTask(task)} title="重新拉取并由 AI 重新打分"
                                  className="rounded border border-[#d5e0f5] bg-[#eaf2ff] px-2 py-1 text-[10px] text-[#4b7ff0] transition hover:bg-[#daeaff]">
                                  重启任务
                                </button>
                              ) : (
                                <button onClick={() => setDetailTask(task)}
                                  className="rounded border border-[#d9e2ee] bg-white px-2 py-1 text-[10px] text-[#4b7ff0] transition hover:bg-[#eef5ff]">
                                  复核结果
                                </button>
                              )}
                              <button onClick={() => deleteTask(task)} title="删除任务"
                                className="flex items-center gap-1 rounded border border-[#f0d8d8] bg-white px-2 py-1 text-[10px] text-[#d75d5d] transition hover:bg-[#fdf3f3]">
                                <Trash2 className="size-3" />删除
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
    </div>
  );
}

function NewTaskModal({ onClose, onCreate }: { onClose: () => void; onCreate: (t: { name: string; status: string; note: string; date: string; filters: { date: string; rounds: string; limit: string; statuses: string[]; vipMin: string; vipMax: string; includeTags: string[]; excludeTags: string[]; agents: string[] } }) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [inspectDate, setInspectDate] = useState(today);
  const [dateMode, setDateMode] = useState<"single" | "range">("single");
  const [rangeStart, setRangeStart] = useState(today);
  const [rangeEnd, setRangeEnd] = useState(today);
  const [rounds, setRounds] = useState("");
  const [limit, setLimit] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [statusOpen, setStatusOpen] = useState(false);
  const [vipMin, setVipMin] = useState("");
  const [vipMax, setVipMax] = useState("");
  const [includeTags, setIncludeTags] = useState<string[]>([...DEFAULT_INCLUDE_TAGS]);
  const [includeOpen, setIncludeOpen] = useState(false);
  const [includeExpanded, setIncludeExpanded] = useState<string[]>([]);
  const [includeCustom, setIncludeCustom] = useState<string[]>([]);
  const [excludeTags, setExcludeTags] = useState<string[]>([...DEFAULT_EXCLUDE_TAGS]);
  const [agents, setAgents] = useState<string[]>([]);
  const [includeDraft, setIncludeDraft] = useState("");
  const [excludeDraft, setExcludeDraft] = useState("");
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [agentPickerGroup, setAgentPickerGroup] = useState<string | null>(null);
  const [err, setErr] = useState("");

  function addTag(list: string[], setList: (v: string[]) => void, val: string, reset: () => void) {
    const v = val.trim();
    if (v && !list.includes(v)) setList([...list, v]);
    reset();
  }
  function removeTag(list: string[], setList: (v: string[]) => void, tag: string) {
    setList(list.filter(t => t !== tag));
  }
  function toggleStatus(s: string) {
    setStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }
  function toggleInclude(t: string) {
    setIncludeTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }
  // 选中一级：把该大类自身与其下全部二级标签一起选上；再点一次则整组取消。
  function toggleIncludeGroup(g: { level1: string; level2: string[] }) {
    const all = [g.level1, ...g.level2];
    setIncludeTags(prev => {
      const allOn = all.every(t => prev.includes(t));
      return allOn ? prev.filter(t => !all.includes(t)) : [...prev, ...all.filter(t => !prev.includes(t))];
    });
  }
  // 展开 / 收起某个一级，展开后才能单独勾选其下的二级标签。
  function toggleIncludeExpand(level1: string) {
    setIncludeExpanded(prev => prev.includes(level1) ? prev.filter(x => x !== level1) : [...prev, level1]);
  }
  // 折叠态的摘要文案：整组选中只显示一级名称，部分选中显示「一级(已选/总数)」。
  function includeSummary() {
    const parts: string[] = [];
    TAG_TREE.forEach(g => {
      const all = [g.level1, ...g.level2];
      const picked = all.filter(t => includeTags.includes(t)).length;
      if (picked === 0) return;
      parts.push(picked === all.length ? g.level1 : `${g.level1}(${picked}/${all.length})`);
    });
    includeCustom.forEach(t => { if (includeTags.includes(t)) parts.push(t); });
    return parts.join("、");
  }
  // 二级选择：勾选/取消某个客服姓名。AI客服无姓名，选中后以「AI客服」整体作为一项。
  function toggleAgent(a: string) {
    setAgents(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  }
  // 某分组下的客服姓名全选 / 取消全选。
  function toggleGroupAll(names: string[]) {
    setAgents(prev => {
      const allOn = names.length > 0 && names.every(n => prev.includes(n));
      return allOn ? prev.filter(n => !names.includes(n)) : [...prev, ...names.filter(n => !prev.includes(n))];
    });
  }
  function submit() {
    if (!name.trim()) { setErr("请填写任务名称"); return; }
    if (dateMode === "range") {
      if (!rangeStart || !rangeEnd) { setErr("请选择质检的起止日期"); return; }
      if (rangeStart > rangeEnd) { setErr("质检时间段的开始日期不能晚于结束日期"); return; }
    }
    if (vipMin && vipMax && Number(vipMin) > Number(vipMax)) { setErr("VIP 范围的最低等级不能高于最高等级"); return; }
    // 单日：date 即当天；时间段：date 展示为「起 ~ 止」，并在 filters 中带上起止日期。
    const taskDate = dateMode === "single" ? inspectDate : `${rangeStart} ~ ${rangeEnd}`;
    onCreate({
      name: name.trim(),
      status: "拉取中",
      note: note.trim(),
      date: taskDate,
      filters: { date: taskDate, rounds: rounds.trim(), limit: limit.trim() || "50", statuses, vipMin, vipMax, includeTags, excludeTags, agents },
    });
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-6" onClick={onClose}>
      <div className="max-h-full w-full max-w-[440px] overflow-auto rounded-xl bg-white shadow-[0_24px_60px_rgba(41,53,66,.28)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#e9edf0] px-5 py-3.5">
          <div>
            <div className="text-[13px] font-semibold text-[#2f3b48]">新增质检任务</div>
            <div className="mt-0.5 text-[10px] text-[#8b96a3]">设置任务信息与要质检的客诉筛选条件</div>
          </div>
          <button onClick={onClose} className="text-[#85919d] hover:text-[#3e4c5a]"><X className="size-4" /></button>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <div>
            <label className="mb-1 block text-[11px] text-[#5a6572]">任务名称 <span className="text-[#e59735]">*</span></label>
            <input value={name} onChange={e => { setName(e.target.value); if (err) setErr(""); }} placeholder="如：2024-10-12 客诉服务质检"
              className="h-9 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-[12px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]" />
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[#5a6572]">备注</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="选填，如：十月第二周补检"
              className="h-9 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-[12px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]" />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] text-[#5a6572]">质检日期</label>
              <div className="flex rounded-lg border border-[#e2e8f0] bg-[#f5f7fa] p-0.5">
                <button onClick={() => { setDateMode("single"); if (err) setErr(""); }}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition ${dateMode === "single" ? "bg-white text-[#4b7ff0] shadow-sm" : "text-[#8b97a3] hover:text-[#5a6572]"}`}>某天</button>
                <button onClick={() => { setDateMode("range"); if (err) setErr(""); }}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition ${dateMode === "range" ? "bg-white text-[#4b7ff0] shadow-sm" : "text-[#8b97a3] hover:text-[#5a6572]"}`}>时间段</button>
              </div>
            </div>
            {dateMode === "single" ? (
              <input type="date" value={inspectDate} onChange={e => setInspectDate(e.target.value)}
                className="h-9 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-[12px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
            ) : (
              <div className="flex items-center gap-2">
                <input type="date" value={rangeStart} max={rangeEnd || undefined}
                  onChange={e => { setRangeStart(e.target.value); if (err) setErr(""); }}
                  className="h-9 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-[12px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
                <span className="shrink-0 text-[11px] text-[#8b97a3]">～</span>
                <input type="date" value={rangeEnd} min={rangeStart || undefined}
                  onChange={e => { setRangeEnd(e.target.value); if (err) setErr(""); }}
                  className="h-9 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-[12px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
              </div>
            )}
          </div>

          <div className="border-t border-[#eef1f4] pt-3">
            <div className="mb-2 text-[11px] font-semibold text-[#374350]">客诉筛选条件</div>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] text-[#8b97a3]">对话轮次</label>
                <input type="number" min={1} value={rounds}
                  onChange={e => setRounds(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  placeholder="如：3"
                  className="h-8 w-full rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-[#8b97a3]">客诉数量上限</label>
                <input type="number" min={1} value={limit}
                  onChange={e => setLimit(e.target.value)}
                  placeholder="默认 50"
                  className="h-8 w-full rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]" />
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-1.5 block text-[10px] text-[#8b97a3]">客诉状态</label>
              <div className="relative">
                <button onClick={() => setStatusOpen(o => !o)}
                  className="flex h-8 w-full items-center justify-between rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none hover:border-[#4b7ff0]">
                  <span className={statuses.length ? "text-[#3e4c5a]" : "text-[#b5bfc9]"}>{statuses.length ? statuses.join("、") : "不限（点击选择，可多选）"}</span>
                  <ChevronRight className={`size-3.5 shrink-0 text-[#8b97a3] transition-transform ${statusOpen ? "rotate-90" : ""}`} />
                </button>
                {statusOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-[#dde5ee] bg-white p-1 shadow-lg">
                    {COMPLAINT_STATUS_OPTIONS.map(s => {
                      const on = statuses.includes(s);
                      return (
                        <button key={s} onClick={() => toggleStatus(s)}
                          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] transition ${on ? "bg-[#eef4ff] text-[#3562c8]" : "text-[#4d5966] hover:bg-[#f4f7fb]"}`}>
                          <span className={`grid size-3.5 place-items-center rounded border ${on ? "border-[#4b7ff0] bg-[#4b7ff0] text-white" : "border-[#c9d2dc] bg-white"}`}>{on && <span className="text-[8px] leading-none">✓</span>}</span>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-1.5 block text-[10px] text-[#8b97a3]">VIP 范围</label>
              <div className="flex items-center gap-2">
                <select value={vipMin} onChange={e => { setVipMin(e.target.value); if (err) setErr(""); }}
                  className="h-8 w-full rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]">
                  <option value="">最低等级</option>
                  {VIP_LEVELS.map(l => <option key={l} value={l}>{`VIP ${l}`}</option>)}
                </select>
                <span className="shrink-0 text-[11px] text-[#8b97a3]">～</span>
                <select value={vipMax} onChange={e => { setVipMax(e.target.value); if (err) setErr(""); }}
                  className="h-8 w-full rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]">
                  <option value="">最高等级</option>
                  {VIP_LEVELS.map(l => <option key={l} value={l}>{`VIP ${l}`}</option>)}
                </select>
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-1.5 block text-[10px] text-[#8b97a3]">包含其中任一标签</label>
              <div className="relative">
                <button onClick={() => setIncludeOpen(o => !o)}
                  className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none hover:border-[#4b7ff0]">
                  <span className={`truncate ${includeTags.length ? "text-[#3e4c5a]" : "text-[#b5bfc9]"}`}>{includeTags.length ? includeSummary() : "不限（点击选择，可多选）"}</span>
                  <ChevronRight className={`size-3.5 shrink-0 text-[#8b97a3] transition-transform ${includeOpen ? "rotate-90" : ""}`} />
                </button>
                {includeOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIncludeOpen(false)} />
                    <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-xl border border-[#e4eaf2] bg-white shadow-[0_16px_40px_-8px_rgba(41,53,66,.22)]">
                      <div className="max-h-[230px] overflow-auto p-1.5">
                        {TAG_TREE.map(g => {
                          const all = [g.level1, ...g.level2];
                          const picked = all.filter(t => includeTags.includes(t)).length;
                          const allOn = picked === all.length;
                          const someOn = picked > 0 && !allOn;
                          const open = includeExpanded.includes(g.level1);
                          return (
                            <div key={g.level1} className="mb-0.5">
                              {/* 一级：左侧勾选＝整组全选，右侧箭头＝展开看二级 */}
                              <div className={`flex items-center gap-1 rounded-lg transition ${allOn || someOn ? "bg-[#eef4ff]" : "hover:bg-[#f4f7fb]"}`}>
                                <button onClick={() => toggleIncludeGroup(g)}
                                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] transition ${allOn || someOn ? "font-medium text-[#3562c8]" : "text-[#4d5966]"}`}>
                                  <span className={`grid size-4 shrink-0 place-items-center rounded-[5px] border transition ${allOn ? "border-[#4b7ff0] bg-[#4b7ff0] text-white" : someOn ? "border-[#4b7ff0] bg-white" : "border-[#c9d2dc] bg-white"}`}>
                                    {allOn ? <Check className="size-3" /> : someOn ? <span className="size-1.5 rounded-[1px] bg-[#4b7ff0]" /> : null}
                                  </span>
                                  <span className="truncate">{g.level1}</span>
                                  <span className="shrink-0 text-[9px] text-[#a8b2be]">{picked > 0 ? `已选 ${picked}/${all.length}` : `${all.length} 个标签`}</span>
                                </button>
                                <button onClick={() => toggleIncludeExpand(g.level1)}
                                  className="grid size-7 shrink-0 place-items-center rounded-md text-[#8b97a3] transition hover:bg-[#e9eef5] hover:text-[#4d5966]" title={open ? "收起二级标签" : "展开二级标签"}>
                                  <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
                                </button>
                              </div>
                              {/* 二级：展开后可单独勾选 */}
                              {open && (
                                <div className="ml-3 mt-0.5 grid grid-cols-2 gap-0.5 border-l border-[#e9eef5] pl-2">
                                  {g.level2.map(t => {
                                    const on = includeTags.includes(t);
                                    return (
                                      <button key={t} onClick={() => toggleInclude(t)}
                                        className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[10px] transition ${on ? "bg-[#eef4ff] font-medium text-[#3562c8]" : "text-[#5a6674] hover:bg-[#f4f7fb]"}`}>
                                        <span className={`grid size-3.5 shrink-0 place-items-center rounded-[4px] border transition ${on ? "border-[#4b7ff0] bg-[#4b7ff0] text-white" : "border-[#c9d2dc] bg-white"}`}>{on && <Check className="size-2.5" />}</span>
                                        <span className="truncate">{t}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {/* 自定义标签：不属于任何一级，单列在末尾 */}
                        {includeCustom.length > 0 && (
                          <div className="mt-1 border-t border-[#f0f3f7] pt-1">
                            <div className="px-2.5 pb-0.5 text-[9px] text-[#a8b2be]">自定义标签</div>
                            {includeCustom.map(t => {
                              const on = includeTags.includes(t);
                              return (
                                <button key={t} onClick={() => toggleInclude(t)}
                                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] transition ${on ? "bg-[#eef4ff] font-medium text-[#3562c8]" : "text-[#4d5966] hover:bg-[#f4f7fb]"}`}>
                                  <span className={`grid size-4 shrink-0 place-items-center rounded-[5px] border transition ${on ? "border-[#4b7ff0] bg-[#4b7ff0] text-white" : "border-[#c9d2dc] bg-white"}`}>{on && <Check className="size-3" />}</span>
                                  <span className="truncate">{t}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 border-t border-[#eef1f4] bg-[#f7f9fc] px-3 py-2">
                        <Plus className="size-3 shrink-0 text-[#8b97a3]" />
                        <input value={includeDraft} onChange={e => setIncludeDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              const v = includeDraft.trim();
                              if (v) { if (!includeCustom.includes(v)) setIncludeCustom(prev => [...prev, v]); if (!includeTags.includes(v)) setIncludeTags(prev => [...prev, v]); }
                              setIncludeDraft("");
                            }
                          }}
                          placeholder="自定义标签，回车添加"
                          className="min-w-0 flex-1 bg-transparent text-[10px] text-[#3e4c5a] outline-none placeholder-[#b5bfc9]" />
                        <span className="shrink-0 text-[10px] text-[#8b97a3]">已选 <span className="font-semibold text-[#4b7ff0]">{includeTags.length}</span> 项</span>
                        {includeTags.length > 0 && <button onClick={() => setIncludeTags([])} className="shrink-0 rounded-md px-1.5 py-1 text-[10px] text-[#8b97a3] transition hover:bg-[#eef1f5] hover:text-[#4d5966]">清空</button>}
                        <button onClick={() => setIncludeOpen(false)} className="shrink-0 rounded-md bg-[#4b7ff0] px-2.5 py-1 text-[10px] font-medium text-white transition hover:bg-[#3d6fe0]">完成</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-1.5 block text-[10px] text-[#8b97a3]">不包含其中任一标签</label>
              <div className="flex flex-wrap items-center gap-1.5">
                {excludeTags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 rounded-full bg-[#d75d5d] py-1 pl-2.5 pr-1 text-[10px] font-medium text-white">
                    {tag}
                    <button onClick={() => removeTag(excludeTags, setExcludeTags, tag)} className="grid size-3.5 place-items-center rounded-full hover:bg-white/25"><X className="size-2.5" /></button>
                  </span>
                ))}
                <span className="flex items-center gap-1 rounded-full border border-dashed border-[#e6b3b3] bg-[#fdf5f5] py-1 pl-2 pr-1.5 text-[10px] text-[#c08a8a]">
                  <Plus className="size-2.5" />
                  <input value={excludeDraft} onChange={e => setExcludeDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addTag(excludeTags, setExcludeTags, excludeDraft, () => setExcludeDraft("")); }}
                    placeholder="输入标签，回车添加"
                    className="w-[100px] bg-transparent text-[10px] text-[#3e4c5a] outline-none placeholder-[#d3aeae]" />
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] text-[#8b97a3]">添加想要质检的客服（按分组选择）</label>
              <div className="relative">
                <div onClick={() => { if (!agentPickerOpen) { setAgentPickerOpen(true); setAgentPickerGroup(AGENT_ROSTER[0].group); } }}
                  className={`flex min-h-9 cursor-pointer flex-wrap items-center gap-1.5 rounded-md border bg-white px-2 py-1.5 transition ${agentPickerOpen ? "border-[#4b7ff0]" : "border-[#dbe3ee] hover:border-[#c3d0e0]"}`}>
                  {agents.map(a => (
                    <span key={a} className="flex items-center gap-1 rounded-full bg-[#eef1f5] py-0.5 pl-2.5 pr-1 text-[10px] font-medium text-[#4d5966]">
                      {a}
                      <button onClick={e => { e.stopPropagation(); toggleAgent(a); }} className="grid size-3.5 place-items-center rounded-full text-[#8b97a3] hover:bg-[#dfe4ea]"><X className="size-2.5" /></button>
                    </span>
                  ))}
                  <span className="flex items-center gap-1 px-1 text-[10px] text-[#8b97a3]">
                    <Plus className="size-3" />{agents.length > 0 ? "继续添加" : "点击选择客服"}
                  </span>
                  <ChevronRight className={`ml-auto size-3.5 shrink-0 text-[#8b97a3] transition-transform ${agentPickerOpen ? "rotate-90" : ""}`} />
                </div>
                {agentPickerOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setAgentPickerOpen(false)} />
                    <div className="absolute bottom-full left-0 right-0 z-20 mb-1.5 grid grid-cols-[136px_1fr] overflow-hidden rounded-xl border border-[#e4eaf2] bg-white shadow-[0_-16px_40px_-8px_rgba(41,53,66,.22)]">
                      {/* 一级：分组 */}
                      <div className="max-h-[228px] overflow-auto border-r border-[#eef1f4] bg-[#f7f9fc] p-1.5">
                        {AGENT_ROSTER.map(g => {
                          const on = agentPickerGroup === g.group;
                          const picked = g.group === "AI客服" ? (agents.includes("AI客服") ? 1 : 0) : g.names.filter(n => agents.includes(n)).length;
                          return (
                            <button key={g.group} onClick={() => setAgentPickerGroup(g.group)}
                              className={`mb-0.5 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[11px] transition ${on ? "bg-white font-medium text-[#3562c8] shadow-[0_1px_3px_rgba(41,53,66,.08)]" : "text-[#5a6674] hover:bg-[#eef2f7]"}`}>
                              <span className="flex items-center gap-1.5">
                                <span className={`size-1.5 rounded-full ${picked > 0 ? "bg-[#4b7ff0]" : "bg-transparent"}`} />
                                {g.group}
                              </span>
                              {picked > 0 && <span className="rounded-full bg-[#eef4ff] px-1.5 py-0.5 text-[9px] font-semibold text-[#4b7ff0]">{picked}</span>}
                            </button>
                          );
                        })}
                      </div>
                      {/* 二级：姓名 */}
                      <div className="flex max-h-[228px] flex-col">
                        {(() => {
                          const g = AGENT_ROSTER.find(x => x.group === agentPickerGroup);
                          if (!g) return null;
                          if (g.group === "AI客服") {
                            const on = agents.includes("AI客服");
                            return (
                              <div className="overflow-auto p-1.5">
                                <button onClick={() => toggleAgent("AI客服")}
                                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] transition ${on ? "bg-[#eef4ff] font-medium text-[#3562c8]" : "text-[#4d5966] hover:bg-[#f4f7fb]"}`}>
                                  <span className={`grid size-4 shrink-0 place-items-center rounded-[5px] border transition ${on ? "border-[#4b7ff0] bg-[#4b7ff0] text-white" : "border-[#c9d2dc] bg-white"}`}>{on && <Check className="size-3" />}</span>
                                  AI客服（整组质检，无需选择姓名）
                                </button>
                              </div>
                            );
                          }
                          if (g.names.length === 0) return <div className="grid flex-1 place-items-center px-2 py-8 text-[10px] text-[#b0bbc8]">该分组暂无客服</div>;
                          const allOn = g.names.every(n => agents.includes(n));
                          return (
                            <>
                              {/* 全选行 */}
                              <button onClick={() => toggleGroupAll(g.names)}
                                className="flex shrink-0 items-center gap-2 border-b border-[#f0f3f7] px-3 py-2 text-left text-[11px] font-medium text-[#4d5966] transition hover:bg-[#f7f9fc]">
                                <span className={`grid size-4 shrink-0 place-items-center rounded-[5px] border transition ${allOn ? "border-[#4b7ff0] bg-[#4b7ff0] text-white" : "border-[#c9d2dc] bg-white"}`}>{allOn && <Check className="size-3" />}</span>
                                全选本组（{g.names.length} 人）
                              </button>
                              <div className="grid grid-cols-2 gap-1 overflow-auto p-1.5">
                                {g.names.map(n => {
                                  const on = agents.includes(n);
                                  return (
                                    <button key={n} onClick={() => toggleAgent(n)}
                                      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] transition ${on ? "bg-[#eef4ff] font-medium text-[#3562c8]" : "text-[#4d5966] hover:bg-[#f4f7fb]"}`}>
                                      <span className={`grid size-4 shrink-0 place-items-center rounded-[5px] border transition ${on ? "border-[#4b7ff0] bg-[#4b7ff0] text-white" : "border-[#c9d2dc] bg-white"}`}>{on && <Check className="size-3" />}</span>
                                      {n}
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      <div className="col-span-2 flex items-center justify-between border-t border-[#eef1f4] bg-[#f7f9fc] px-3 py-2">
                        <span className="text-[10px] text-[#8b97a3]">已选 <span className="font-semibold text-[#4b7ff0]">{agents.length}</span> 项</span>
                        <div className="flex items-center gap-2">
                          {agents.length > 0 && <button onClick={() => setAgents([])} className="rounded-md px-2 py-1 text-[10px] text-[#8b97a3] transition hover:bg-[#eef1f5] hover:text-[#4d5966]">清空</button>}
                          <button onClick={() => setAgentPickerOpen(false)} className="rounded-md bg-[#4b7ff0] px-3 py-1 text-[10px] font-medium text-white transition hover:bg-[#3d6fe0]">完成</button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {err && <div className="rounded-md bg-[#fff0f0] px-3 py-2 text-[10px] text-[#d75d5d]">{err}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#e9edf0] px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-[#d9e2ee] bg-white px-3 py-1.5 text-[11px] text-[#6b7a89] hover:bg-[#f2f5f9]">取消</button>
          <button onClick={submit} className="rounded-md bg-[#4b7ff0] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#3f72e0]">创建任务</button>
        </div>
      </div>
    </div>
  );
}

function ConversationReview({ complaint, review, commonCats, privateCats, isExcellent, onToggleExcellent, onBack, onSave, onGoToRule, canFeedback, onSummaryFeedback }: { complaint: Complaint; review: Review | null; commonCats: Cat[]; privateCats: Cat[]; isExcellent: boolean; onToggleExcellent: (c: Complaint) => void; onBack: () => void; onSave: (r: Review) => void; onGoToRule: (name: string) => void; canFeedback: boolean; onSummaryFeedback: (c: Complaint, text: string) => void }) {
  const involvedRules = Array.from(new Set(complaint.aiIssues.map(i => i.rule)));
  // 全部质检规则按门类分组（通用/专用），携带各维度扣分值，供人工检索标注实际扣分点。
  // 只列对本客诉客服类型生效的维度——不生效的规则本来就不会参与评分，摆出来只会误导标注。
  // 判断标准取该类型实际加载的那份（分叉过就用分叉的，没分叉自动回落到基准）。
  const pickRules = (c: Cat) => c.dimensions
    .filter(d => dimApplies(d, complaint.agentType))
    .map(d => ({ title: d.title, score: d.score, criteria: criteriaFor(d, complaint.agentType) }));
  const ruleGroups = [
    ...commonCats.map(c => ({ scope: "通用", name: c.name, rules: pickRules(c) })),
    ...privateCats.map(c => ({ scope: "专用", name: c.name, rules: pickRules(c) })),
  ].filter(g => g.rules.length > 0);
  // 规则名 → 扣分值 映射，用于已选胶囊展示。
  const ruleScoreMap: Record<string, string> = {};
  ruleGroups.forEach(g => g.rules.forEach(r => { ruleScoreMap[r.title] = r.score; }));
  // 是否处于「异议中」：已存在未认可的复审（草稿或已提交）即视为异议进行中。
  const objecting = !!review && !review.agreed;
  const submitted = !!review && !review.agreed && review.submitted;
  const reran = !!review && !review.agreed && review.reran;
  const objectedRules = objecting ? review!.objectedRules : [];
  const [selectedRules, setSelectedRules] = useState<string[]>(objectedRules);
  const [score, setScore] = useState(review?.suggestedScore ?? "");
  const [detail, setDetail] = useState(review?.detail ?? "");
  const [agentNote, setAgentNote] = useState(review?.agentNote ?? "");
  const [deductedRules, setDeductedRules] = useState<string[]>(review?.deductedRules ?? []);
  const [deductPickerOpen, setDeductPickerOpen] = useState(false);
  const [deductSearch, setDeductSearch] = useState("");
  const [err, setErr] = useState("");
  // 历史会话面板：手动展开查看该用户过往客诉会话与摘要；默认折叠，可逐条展开/收起。
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<string[]>([]);
  const toggleHistory = (id: string) => setExpandedHistory(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const historyList = complaint.history ?? [];
  // 「玩家历史处理信息」的反馈入口：质检人员反馈这份历史总结缺了哪些与质检客诉相关的信息、
  // 哪些信息其实不需要，用于回头调整总结的取材范围。纯内存，离开该客诉即重置。
  const [summaryFbOpen, setSummaryFbOpen] = useState(false);
  const [summaryFbText, setSummaryFbText] = useState("");
  const [summaryFbSent, setSummaryFbSent] = useState<string | null>(null);
  const summaryFbRef = useRef<HTMLTextAreaElement>(null);
  // 工单弹窗：查看客服针对当前客诉提交的工单详情。
  const [workOrderOpen, setWorkOrderOpen] = useState(false);
  const [logDesc, setLogDesc] = useState(true); // 历史记录排序：默认倒序（最新在前）
  // 已提交的异议默认只读；草稿默认可编辑。点「更新异议」才展开编辑。
  const [editing, setEditing] = useState(!submitted);
  const detailRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  // 输入框随内容行数自增长：内容变化或进入编辑态时，按 scrollHeight 撑高。
  useEffect(() => {
    [detailRef.current, noteRef.current, summaryFbRef.current].forEach(el => {
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });
  }, [detail, agentNote, editing, summaryFbText, summaryFbOpen]);
  // 切换到另一条客诉时清空历史总结反馈，避免上一条的反馈残留在这一条上。
  useEffect(() => { setSummaryFbOpen(false); setSummaryFbText(""); setSummaryFbSent(null); }, [complaint.id]);
  // 简约滚动条：细窄、圆角、浅灰，悬停加深；轨道透明。
  const scrollCls = "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#d2dae6] hover:[&::-webkit-scrollbar-thumb]:bg-[#b8c3d2]";

  const preview = rescore(complaint, objecting ? review!.objectedRules : []);

  // 保存草稿（不改变 submitted 状态），跨页面（跳转规则）保留异议进度。
  function saveDraft(patch: Partial<Review>) {
    const base: Review = review && !review.agreed ? review : { agreed: false, submitted: false, objectedRules: [], reran: false, suggestedScore: "", detail: "", agentNote: "", deductedRules: [] };
    onSave({ ...base, ...patch });
  }
  function toggleRule(r: string) {
    const next = selectedRules.includes(r) ? selectedRules.filter(x => x !== r) : [...selectedRules, r];
    setSelectedRules(next);
    saveDraft({ objectedRules: next });
    if (err) setErr("");
  }
  // 人工标注该客服实际扣分的规则（与「有异议规则」相互独立）。
  function toggleDeducted(r: string) {
    const next = deductedRules.includes(r) ? deductedRules.filter(x => x !== r) : [...deductedRules, r];
    setDeductedRules(next);
    saveDraft({ deductedRules: next });
    if (err) setErr("");
  }
  // 总分非空且不满分（<100）时，才需要人工指出实际扣分点。
  const needDeducted = score.trim() !== "" && !Number.isNaN(Number(score)) && Number(score) < 100;
  function agreeNoIssue() {
    onSave({ agreed: true, submitted: true, objectedRules: [], reran: false, suggestedScore: "", detail: "", agentNote: "", deductedRules: [] });
  }
  // 点「有异议」：立即建立异议草稿，返回后仍在异议流程中。
  function startObjection() {
    setSelectedRules([]); setScore(""); setDetail(""); setAgentNote(""); setDeductedRules([]); setErr(""); setEditing(true);
    onSave({ agreed: false, submitted: false, objectedRules: [], reran: false, suggestedScore: "", detail: "", agentNote: "", deductedRules: [] });
  }
  function submitObjection() {
    if (involvedRules.length > 0 && selectedRules.length === 0) { setErr("请至少选择一个有异议的评分规则"); return; }
    if (!score.trim()) { setErr("请填写该客服应有的总分"); return; }
    if (!detail.trim()) { setErr("请填写对 AI 评分的意见"); return; }
    if (needDeducted && deductedRules.length === 0) { setErr("该客服未满分，请选择实际扣分的规则"); return; }
    onSave({ agreed: false, submitted: true, objectedRules: selectedRules, reran: !!review?.reran, suggestedScore: score.trim(), detail: detail.trim(), agentNote: agentNote.trim(), deductedRules: Number(score) < 100 ? deductedRules : [] });
    setErr("");
    setEditing(false);
  }
  // 点「更新异议」：回到草稿态并展开编辑，跳转规则页返回后仍保持编辑。
  function editObjection() {
    setSelectedRules(review && !review.agreed ? review.objectedRules : []);
    setScore(review?.suggestedScore ?? "");
    setDetail(review?.detail ?? "");
    setAgentNote(review?.agentNote ?? "");
    setDeductedRules(review?.deductedRules ?? []);
    setErr("");
    setEditing(true);
    saveDraft({ submitted: false });
  }
  // 点规则跳转去修改：先在修改意见中默认选上该规则，返回后仍保持勾选。
  function goToRuleFromObjection(r: string) {
    if (!selectedRules.includes(r)) {
      const next = [...selectedRules, r];
      setSelectedRules(next);
      saveDraft({ objectedRules: next });
    }
    onGoToRule(r);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f4f6fa]">
      <header className="flex h-[60px] items-center gap-3 border-b border-[#e2e6eb] bg-white px-5">
        <button onClick={onBack} className="flex size-8 items-center justify-center rounded-full border border-[#e0e7f1] bg-white text-[#4b7ff0] transition hover:border-[#c3d6f4] hover:bg-[#eef5ff]">
          <ChevronRight className="size-4 rotate-180" />
        </button>
        <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#5a8bf5] to-[#3d6fe0] text-[12px] font-semibold text-white shadow-[0_4px_10px_rgba(75,127,240,.28)]">
          {complaint.agent.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold text-[#2f3b48]">复审会话 · {complaint.agent}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#8b96a3]">
            <UserRound className="size-3 text-[#a8b2be]" />用户 {complaint.user}
            <span className="text-[#d3d9e0]">·</span>
            <Bot className="size-3 text-[#a8b2be]" />AI 评分 <span className="font-medium text-[#5a6675]">{complaint.score} 分</span>
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden px-8 py-5">
        <div className="mx-auto flex min-h-0 w-full max-w-[1680px] gap-5">
          {/* 左栏：客服与用户对话（独立滚动） */}
          <div className="flex min-h-0 w-[45%] shrink-0 flex-col overflow-hidden rounded-2xl border border-[#e6ecf4] bg-white shadow-[0_6px_24px_-8px_rgba(41,53,66,.12)]">
            <div className="flex items-center gap-2.5 border-b border-[#eef2f7] bg-gradient-to-b from-white to-[#f9fbff] px-4 py-3.5">
              <div className="flex size-7 items-center justify-center rounded-xl bg-gradient-to-br from-[#eaf1ff] to-[#dfeaff] text-[#4b7ff0] shadow-[inset_0_1px_0_rgba(255,255,255,.7)]"><MessageSquareText className="size-4" /></div>
              <div className="flex flex-col">
                <span className="text-[12px] font-semibold text-[#333f4c]">客服与用户对话</span>
                <span className="text-[9px] text-[#a3adba]">{historyOpen ? "该用户过往客诉会话与摘要" : "按时间先后展示完整客诉会话"}</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setWorkOrderOpen(true)}
                  className="flex items-center gap-1.5 rounded-full border border-[#dbe6f6] bg-white px-2.5 py-1 text-[10px] font-medium text-[#4b7ff0] transition hover:bg-[#eef5ff]"
                >
                  <ClipboardCheck className="size-3.5" />工单
                </button>
                <button
                  onClick={() => { setHistoryOpen(v => !v); setExpandedHistory([]); }}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition ${historyOpen ? "bg-[#4b7ff0] text-white shadow-[0_2px_8px_-1px_rgba(75,127,240,.5)]" : "border border-[#dbe6f6] bg-white text-[#4b7ff0] hover:bg-[#eef5ff]"}`}
                >
                  <History className="size-3.5" />历史会话
                  {historyList.length > 0 && (
                    <span className={`rounded-full px-1.5 text-[9px] font-semibold ${historyOpen ? "bg-white/25 text-white" : "bg-[#eef4ff] text-[#4b7ff0]"}`}>{historyList.length}</span>
                  )}
                </button>
                {!historyOpen && (
                  <span className="flex items-center gap-1 rounded-full bg-[#f2f5fa] px-2.5 py-1 text-[9px] font-medium text-[#7c8896]">
                    <span className="size-1.5 rounded-full bg-[#4b7ff0]" />{complaint.chat.length} 条
                  </span>
                )}
              </div>
            </div>
            {historyOpen ? (
              <div className={`min-h-0 flex-1 overflow-auto bg-[#fbfcfe] px-4 py-4 ${scrollCls}`}>
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 px-1 text-[10px] text-[#8b96a3]">
                    <UserRound className="size-3 text-[#a8b2be]" />用户 {complaint.user} 的历史客诉 · 共 {historyList.length} 次
                  </div>
                  {complaint.historySummary && (
                    <>
                      {/* 部分一：玩家历史处理信息——四个固定字段把历史客诉交接清楚 */}
                      <div className="rounded-2xl border border-[#dfe8fb] bg-gradient-to-br from-[#eef4ff] to-[#e4edff] p-3.5 shadow-[0_2px_10px_-6px_rgba(75,127,240,.4)]">
                        <div className="mb-2.5 flex items-center gap-1.5">
                          <span className="flex items-center gap-1 rounded-md bg-[#4b7ff0] px-1.5 py-0.5 text-[9px] font-semibold text-white"><Sparkles className="size-2.5" />玩家历史处理信息</span>
                          {/* 反馈入口：悬停出下划线的灰色小字，点开后写这份总结缺了什么、哪些其实不需要。
                              只对质检人员与业务管理者开放；超级管理者是这些反馈的接收方（见「总结反馈」页），
                              自己不提反馈，故这里不出现该入口。 */}
                          {canFeedback && (
                            <button
                              onClick={() => { setSummaryFbOpen(v => !v); setSummaryFbSent(null); }}
                              className={`ml-auto text-[9px] transition hover:underline ${summaryFbOpen ? "text-[#4b7ff0]" : "text-[#8b96a3] hover:text-[#6b7a89]"}`}
                            >
                              我要反馈
                            </button>
                          )}
                        </div>
                        {canFeedback && summaryFbOpen && (
                          <div className="mb-2.5 rounded-xl border border-[#dfe8fb] bg-white/85 p-3">
                            <textarea value={summaryFbText} ref={summaryFbRef}
                              onChange={e => { setSummaryFbText(e.target.value); if (summaryFbSent) setSummaryFbSent(null); }}
                              rows={3}
                              placeholder="这份历史总结缺少哪些对质检本次客诉有用的信息？哪些信息其实不需要？"
                              className="w-full resize-none overflow-hidden rounded-lg border border-[#dbe3ee] bg-[#fafbfd] px-2.5 py-2 text-[10.5px] leading-relaxed text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0] focus:bg-white placeholder-[#b5bfc9]" />
                            <div className="mt-2 flex items-center justify-end gap-2">
                              {summaryFbSent && <span className="mr-auto flex items-center gap-1 text-[9px] text-[#27955d]"><Check className="size-3" />已提交反馈</span>}
                              <button
                                onClick={() => { setSummaryFbOpen(false); setSummaryFbText(""); setSummaryFbSent(null); }}
                                className="text-[10px] text-[#8b97a3] transition hover:text-[#6b7a89]"
                              >
                                取消
                              </button>
                              <button
                                disabled={summaryFbText.trim() === ""}
                                onClick={() => { const t = summaryFbText.trim(); onSummaryFeedback(complaint, t); setSummaryFbSent(t); setSummaryFbText(""); setSummaryFbOpen(false); }}
                                className="flex items-center gap-1 rounded-lg bg-[#4b7ff0] px-2.5 py-1 text-[10px] font-medium text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:bg-[#c7d5ee]"
                              >
                                <Send className="size-3" />提交反馈
                              </button>
                            </div>
                          </div>
                        )}
                        {canFeedback && !summaryFbOpen && summaryFbSent && (
                          <div className="mb-2.5 flex items-start gap-1.5 rounded-xl border border-[#d9ecdf] bg-[#f3faf5] px-3 py-2">
                            <Check className="mt-0.5 size-3 shrink-0 text-[#27955d]" />
                            <div className="min-w-0">
                              <span className="text-[9px] font-medium text-[#27955d]">已提交反馈</span>
                              <p className="text-[10px] leading-relaxed text-[#4d5966]">{summaryFbSent}</p>
                            </div>
                            <button onClick={() => { setSummaryFbText(summaryFbSent); setSummaryFbOpen(true); }} className="ml-auto shrink-0 text-[9px] text-[#8b96a3] transition hover:text-[#6b7a89] hover:underline">修改</button>
                          </div>
                        )}
                        <div className="rounded-xl border border-[#f0e2c8] bg-white/85 p-3">
                          <dl className="space-y-1.5">
                            {([
                              { k: "玩家诉求", v: complaint.historySummary.handling.demand },
                              { k: "已提供/完成", v: complaint.historySummary.handling.provided },
                              { k: "客服已处理", v: complaint.historySummary.handling.handled },
                              { k: "处理状态", v: complaint.historySummary.handling.status },
                            ] as { k: string; v: string }[]).map(row => (
                              <div key={row.k} className="flex gap-2">
                                <dt className="w-[62px] shrink-0 text-right text-[10px] leading-relaxed text-[#b3a68f]">{row.k}</dt>
                                <dd className="min-w-0 flex-1 text-[10.5px] leading-relaxed text-[#4d5966]">{row.v}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      </div>
                      {/* 部分二：特殊情况备注——来自 AIhelp 的客服历史标注，按内容分「风控标记 / 权益·福利信息」两类 */}
                      <div className="rounded-2xl border border-[#e6e0f0] bg-gradient-to-br from-[#f6f3fd] to-[#efeaf9] p-3.5 shadow-[0_2px_10px_-6px_rgba(124,106,168,.35)]">
                        <div className="mb-2.5 flex items-center gap-1.5">
                          <span className="flex items-center gap-1 rounded-md bg-[#7c6aa8] px-1.5 py-0.5 text-[9px] font-semibold text-white"><Pencil className="size-2.5" />特殊情况备注</span>
                        </div>
                        {complaint.historySummary.notes.length === 0 ? (
                          <div className="rounded-xl border border-[#e6e0f0] bg-white/85 px-3 py-2.5 text-[10px] text-[#a8b2be]">该用户暂无特殊情况备注。</div>
                        ) : (
                          <div className="space-y-2">
                            {(["risk", "benefit"] as NoteKind[]).map(kind => {
                              const list = complaint.historySummary!.notes.filter(n => n.kind === kind);
                              if (list.length === 0) return null;
                              const meta = NOTE_META[kind];
                              return (
                                <div key={kind} className={`rounded-xl border p-3 ${meta.box}`}>
                                  <div className="mb-1.5 flex items-center gap-1.5">
                                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${meta.chip}`}>{meta.label}</span>
                                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${meta.chip}`}>{list.length}</span>
                                  </div>
                                  <ul className="space-y-2">
                                    {list.map((n, i) => (
                                      <li key={i} className="flex gap-1.5">
                                        <span className={`mt-1 size-1.5 shrink-0 rounded-full ${meta.dot}`} />
                                        {/* 备注为自由文本，只展示标注正文，不带标注人、日期与处置提示 */}
                                        <p className="min-w-0 text-[10.5px] leading-relaxed text-[#4d5966]">{n.text}</p>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  {historyList.length === 0 ? (
                    <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-[#dbe3ee] bg-white py-10 text-[#a8b2be]">
                      <History className="size-6" /><span className="text-[11px]">该用户暂无历史客诉记录</span>
                    </div>
                  ) : (
                    <>
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[9px] text-[#a3adba]">点击任意会话展开查看完整对话</span>
                      <button
                        onClick={() => setExpandedHistory(expandedHistory.length === historyList.length ? [] : historyList.map(h => h.id))}
                        className="text-[9px] font-medium text-[#4b7ff0] transition hover:underline"
                      >
                        {expandedHistory.length === historyList.length ? "全部收起" : "全部展开"}
                      </button>
                    </div>
                    {historyList.map((h, hi) => {
                    const open = expandedHistory.includes(h.id); // 该会话是否展开
                    const long = h.chat.length > 20; // 超长会话：内部限高滚动
                    const firstUser = h.chat.find(m => m.from === "user"); // 折叠态预览首条用户诉求
                    return (
                    <div key={h.id} className={`overflow-hidden rounded-2xl border bg-white transition ${open ? "border-[#c7d9f7] shadow-[0_6px_20px_-8px_rgba(75,127,240,.3)]" : "border-[#e6ecf4] shadow-[0_2px_8px_-4px_rgba(41,53,66,.1)] hover:border-[#c3d6f4]"}`}>
                      <button onClick={() => toggleHistory(h.id)} className="flex w-full items-center gap-2 bg-gradient-to-b from-white to-[#f9fbff] px-3.5 py-2.5 text-left">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-[9px] font-semibold text-[#4b7ff0]">{historyList.length - hi}</span>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="flex items-center gap-1 text-[9px] font-medium text-[#8b96a3]"><Clock className="size-3 shrink-0" />{h.date}</span>
                          {!open && firstUser && <span className="truncate text-[10px] text-[#5a6675]">{firstUser.text}</span>}
                        </div>
                        <span className="ml-auto flex shrink-0 items-center gap-1 text-[9px] font-medium text-[#8b96a3]">
                          <span className="rounded-full bg-[#f2f5fa] px-1.5 py-0.5 text-[#7c8896]">{h.chat.length} 轮</span>
                          <ChevronRight className={`size-3.5 transition ${open ? "rotate-90 text-[#4b7ff0]" : ""}`} />
                        </span>
                      </button>
                      {open && (
                          <div className={`space-y-3 border-t border-[#f0f3f8] px-3.5 py-3.5 ${long ? `max-h-[360px] overflow-auto ${scrollCls}` : ""}`}>
                            {h.chat.map((m, i) => {
                              const agent = m.from === "agent";
                              return (
                                <div key={i} className={`flex items-end gap-2 ${agent ? "flex-row-reverse" : "flex-row"}`}>
                                  <div className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ring-2 ring-white ${agent ? "bg-gradient-to-br from-[#5a8bf5] to-[#3d6fe0] text-white" : "bg-gradient-to-br from-[#eef1f6] to-[#e1e6ee] text-[#697585]"}`}>{agent ? "服" : "客"}</div>
                                  <div className={`flex max-w-[78%] flex-col gap-1 ${agent ? "items-end" : "items-start"}`}>
                                    <span className="flex items-center gap-1 px-1 text-[9px] text-[#aab3bf]"><span className="font-medium text-[#98a2af]">{agent ? complaint.agent : "用户"}</span><span className="text-[#cdd4dd]">·</span>{m.time}</span>
                                    <div className={`rounded-[14px] px-3 py-2 text-[11px] leading-relaxed ${agent ? "rounded-br-[4px] bg-gradient-to-br from-[#5a8bf5] to-[#4577ec] text-white" : "rounded-bl-[4px] border border-[#e8edf4] bg-white text-[#3e4c5a]"}`}>{m.text}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                      )}
                    </div>
                    );
                  })}
                    </>
                  )}
                </div>
              </div>
            ) : (
            <div className={`min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_1px_1px,#e9eef6_1px,transparent_0)] [background-size:16px_16px] bg-[#fbfcfe] px-4 py-5 ${scrollCls}`}>
              <div className="space-y-4">
              {complaint.chat.map((m, i) => {
                const agent = m.from === "agent";
                return (
                  <div key={i} className={`flex items-end gap-2 ${agent ? "flex-row-reverse" : "flex-row"}`}>
                    <div className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-white ${agent ? "bg-gradient-to-br from-[#5a8bf5] to-[#3d6fe0] text-white shadow-[0_2px_6px_rgba(75,127,240,.35)]" : "bg-gradient-to-br from-[#eef1f6] to-[#e1e6ee] text-[#697585] shadow-[0_2px_5px_rgba(41,53,66,.1)]"}`}>
                      {agent ? "服" : "客"}
                    </div>
                    <div className={`flex max-w-[75%] flex-col gap-1 ${agent ? "items-end" : "items-start"}`}>
                      <span className="flex items-center gap-1 px-1 text-[9px] text-[#aab3bf]">
                        <span className="font-medium text-[#98a2af]">{agent ? complaint.agent : "用户"}</span>
                        <span className="text-[#cdd4dd]">·</span>{m.time}
                      </span>
                      <div className={`rounded-[16px] px-3.5 py-2.5 text-[11px] leading-relaxed ${agent ? "rounded-br-[4px] bg-gradient-to-br from-[#5a8bf5] to-[#4577ec] text-white shadow-[0_3px_10px_-2px_rgba(75,127,240,.4)]" : "rounded-bl-[4px] border border-[#e8edf4] bg-white text-[#3e4c5a] shadow-[0_2px_6px_-2px_rgba(41,53,66,.1)]"}`}>
                        {m.text}
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
            )}
          </div>

          {/* 右栏：AI 评分明细（固定）+ 修改意见（独立滚动） */}
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {/* AI 评分明细（固定不随修改意见滚动） */}
            <div className="shrink-0 overflow-hidden rounded-2xl border border-[#e6ecf4] bg-white shadow-[0_6px_24px_-8px_rgba(41,53,66,.12)]">
            <div className="flex items-center justify-between border-b border-[#eef2f7] bg-gradient-to-b from-white to-[#f9fbff] px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex size-7 items-center justify-center rounded-xl bg-gradient-to-br from-[#eaf1ff] to-[#dfeaff] text-[#4b7ff0] shadow-[inset_0_1px_0_rgba(255,255,255,.7)]"><Sparkles className="size-4" /></div>
                <div className="flex flex-col">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#333f4c]">AI 评分明细
                    {reran && <span className="rounded-full bg-[#eef4ff] px-1.5 py-0.5 text-[9px] font-medium text-[#4b7ff0]">已重运行</span>}
                  </span>
                  <span className="text-[9px] text-[#a3adba]">AI 依据规则给出的扣分项与依据</span>
                </div>
              </div>
              {(() => {
                const val = reran ? preview.newScore : complaint.score;
                const tone = val >= 90 ? { t: "text-[#27955d]", b: "from-[#eafaf1] to-[#dcf4e7]", r: "ring-[#c7ead6]" } : val >= 75 ? { t: "text-[#4b7ff0]", b: "from-[#eef4ff] to-[#e0ebff]", r: "ring-[#d3e2fb]" } : { t: "text-[#d75d5d]", b: "from-[#fdeeee] to-[#fbe1e1]", r: "ring-[#f2d2d2]" };
                return (
                  <div className={`flex items-center gap-1.5 rounded-2xl bg-gradient-to-br ${tone.b} px-3 py-1.5 ring-1 ${tone.r}`}>
                    {reran && <span className="text-[10px] text-[#98a3af] line-through">{complaint.score}</span>}
                    <span className={`text-[22px] font-bold leading-none ${tone.t}`}>{val}</span>
                    <span className="text-[10px] text-[#a8b2be]">分</span>
                  </div>
                );
              })()}
            </div>

            <div className="p-4">
            {/* 明细项：重运行后展示新明细，被移除项以删除线标出 */}
            {complaint.aiIssues.length === 0 ? (
              <div className="flex items-center gap-2.5 rounded-2xl border border-[#d7eede] bg-gradient-to-br from-[#f2faf5] to-[#eafaf1] px-4 py-3.5 text-[11px] text-[#27955d]">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#d7f0e1] text-[#27955d]"><Check className="size-3.5" /></span>
                本次会话无扣分项，AI 判定表现良好。
              </div>
            ) : (
              <div className="space-y-2.5">
                {complaint.aiIssues.map((iss, i) => {
                  const removed = reran && objectedRules.includes(iss.rule);
                  return (
                    <div key={i} className={`relative overflow-hidden rounded-2xl py-2.5 pl-4 pr-3.5 transition ${removed ? "border border-[#dcecc9] bg-gradient-to-br from-[#f6faf0] to-[#f0f6e6]" : "bg-gradient-to-br from-[#fef7f7] to-[#fdf0f0]"}`}>
                      <span className={`absolute inset-y-0 left-0 w-1 ${removed ? "bg-[#8bbf5f]" : "bg-[#e08585]"}`} />
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold ${removed ? "bg-[#e7f2dc] text-[#5c8a3a]" : "bg-[#fce4e4] text-[#d1544f]"}`}>{iss.rule}</span>
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${removed ? "bg-[#eef5e4] text-[#5c8a3a] line-through" : "bg-[#fbeaea] text-[#d1544f]"}`}>{iss.score}</span>
                        {removed && <span className="ml-auto flex items-center gap-1 text-[9px] font-medium text-[#5c8a3a]"><Check className="size-2.5" />已按新规则撤销</span>}
                      </div>
                      <div className={`text-[10px] italic leading-relaxed ${removed ? "text-[#9aa891]" : "text-[#8b97a4]"}`}>{iss.quote}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {reran && (
              <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-[#eef8f2] px-3 py-2 text-[10px] leading-relaxed text-[#27955d]">
                <RefreshCw className="size-3 shrink-0" />
                AI 已按修改后的规则重新评分：{complaint.score} 分 → {preview.newScore} 分（撤销 {objectedRules.length} 项扣分）。可再次修改规则后重运行。
              </div>
            )}

            {/* 决策：仅在尚未做出任何复审结论时展示「没问题 / 有异议」 */}
            {!review && (
              <div className="mt-4 flex items-center gap-2 border-t border-[#eef1f4] pt-4">
                <p className="mr-auto text-[10px] text-[#8b96a3]">对以上 AI 评分是否认可？</p>
                <button onClick={startObjection} className="flex items-center gap-1.5 rounded-lg border border-[#e6c4c4] bg-white px-3.5 py-2 text-[11px] font-medium text-[#c9645f] transition hover:bg-[#fdf6f6]"><AlertCircle className="size-3.5" />有异议</button>
                <button onClick={agreeNoIssue} className="flex items-center gap-1.5 rounded-lg bg-[#4c9e78] px-3.5 py-2 text-[11px] font-medium text-white transition hover:bg-[#44916d]"><ThumbsUp className="size-3.5" />认可，没问题</button>
              </div>
            )}
            {/* 已认可：可改为有异议 */}
            {review && review.agreed && (
              <div className="mt-4 flex items-center gap-2 border-t border-[#eef1f4] pt-4">
                <span className="mr-auto flex items-center gap-1.5 text-[10px] font-medium text-[#4c9e78]"><span className="flex size-4 items-center justify-center rounded-full bg-[#4c9e78] text-white"><Check className="size-2.5" /></span>已确认 AI 评分无异议</span>
                <button onClick={startObjection} className="rounded-lg border border-[#d9e2ee] bg-white px-3 py-1.5 text-[10px] text-[#6b7a89] transition hover:bg-[#f2f5f9]">改为有异议</button>
              </div>
            )}
            {/* 优秀案例：质检人员可在复审时评选，赞成即进入本周优秀案例池 */}
            <div className="mt-3 flex items-center gap-2 border-t border-[#eef1f4] pt-3">
              {isExcellent
                ? <span className="mr-auto flex items-center gap-1.5 text-[10px] font-medium text-[#b9791d]"><Award className="size-3.5" />已入选本周优秀案例</span>
                : <span className="mr-auto text-[10px] text-[#8b96a3]">认为这是一次优质服务？可评选为优秀案例</span>}
              <button onClick={() => onToggleExcellent(complaint)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition ${isExcellent ? "border border-[#e6d3a8] bg-white text-[#b9791d] hover:bg-[#fdf9f0]" : "bg-[#e59735] text-white hover:bg-[#d4882a]"}`}>
                <Award className="size-3.5" />{isExcellent ? "取消优秀案例" : "评为优秀案例"}
              </button>
            </div>
            </div>
          </div>

          {/* 修改意见：卡片头部固定，卡片内正文独立滚动（滚动条内嵌卡片） */}
          {objecting && (
            <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#e6ecf4] bg-white shadow-[0_6px_24px_-8px_rgba(41,53,66,.12)]">
              <div className="flex shrink-0 items-center justify-between border-b border-[#eef2f7] bg-gradient-to-b from-white to-[#f9fbff] px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-xl bg-gradient-to-br from-[#eaf1ff] to-[#dfeaff] text-[#4b7ff0] shadow-[inset_0_1px_0_rgba(255,255,255,.7)]"><Pencil className="size-4" /></div>
                  <span className="text-[12px] font-semibold text-[#333f4c]">修改意见</span>
                </div>
                {submitted
                  ? <span className="flex items-center gap-1 rounded-full bg-[#eaf7f0] px-2 py-0.5 text-[10px] font-medium text-[#27955d]"><span className="size-1.5 rounded-full bg-[#34a36a]" />已提交异议</span>
                  : <span className="flex items-center gap-1 rounded-full bg-[#fdf4e6] px-2 py-0.5 text-[10px] font-medium text-[#e59735]"><span className="size-1.5 rounded-full bg-[#e59735]" />异议草稿（待提交）</span>}
              </div>
              <div className={`min-h-0 flex-1 overflow-auto p-4 ${scrollCls}`}>
              {editing ? (
                <div className="space-y-3.5">
                  {involvedRules.length > 0 ? (
                    <div>
                      <label className="mb-1.5 block text-[10px] text-[#8b97a3]">选择有异议的评分规则（点击规则名可跳转规则设置页修改，不再单独填写原因）</label>
                      <div className="flex flex-wrap gap-1.5">
                        {involvedRules.map(r => {
                          const on = selectedRules.includes(r);
                          return (
                            <div key={r} className={`flex items-center gap-1 rounded-full px-1 py-0.5 transition ${on ? "bg-[#4b7ff0] shadow-[0_2px_6px_rgba(75,127,240,.28)]" : "bg-[#eef1f5]"}`}>
                              <button onClick={() => toggleRule(r)} className={`rounded-full px-2 py-0.5 text-[10px] ${on ? "font-medium text-white" : "text-[#6b7a89]"}`}>{on ? "✓ " : ""}{r}</button>
                              <button onClick={() => goToRuleFromObjection(r)} title="去规则设置页修改该规则" className={`grid size-4 place-items-center rounded-full ${on ? "text-white/90 hover:bg-white/20" : "text-[#8b97a3] hover:bg-[#dfe4ea]"}`}>
                                <SlidersHorizontal className="size-2.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-[#f7f9fb] px-3 py-2.5 text-[10px] leading-relaxed text-[#8b96a3]">本次会话 AI 未涉及任何扣分规则。你仍可对该客服的整体表现提出修改意见，请直接填写应有总分与整体意见。</div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-[10px] text-[#8b97a3]">该客服应有的总分{reran && <span className="ml-1 text-[#4b7ff0]">（重运行已建议 {preview.newScore} 分，可调整）</span>}</label>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={0} max={100} value={score}
                        onChange={e => { setScore(e.target.value); if (err) setErr(""); }}
                        placeholder="0 - 100"
                        className="h-9 w-24 rounded-xl border border-[#dbe3ee] bg-[#fafbfd] px-3 text-[13px] font-semibold text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0] focus:bg-white" />
                      <span className="text-[10px] text-[#8b97a3]">分</span>
                    </div>
                  </div>

                  {needDeducted && (
                    <div>
                      <label className="mb-1.5 block text-[10px] text-[#8b97a3]">该客服实际扣分的规则<span className="ml-1 text-[#a8b2be]">（未满分，请指出实际失分的规则；可多选，涵盖全部质检规则）</span></label>
                      {/* 统一为一个「标签输入框」：已选胶囊内嵌其中，末尾内联「+ 添加」触发，下拉从下方弹出 */}
                      <div className="relative">
                        <div
                          onClick={() => { if (!deductPickerOpen) { setDeductPickerOpen(true); setDeductSearch(""); } }}
                          className={`flex min-h-9 cursor-text flex-wrap items-center gap-1.5 rounded-xl border bg-[#fafbfd] px-2 py-1.5 transition ${deductPickerOpen ? "border-[#4b7ff0] bg-white" : "border-[#dbe3ee] hover:border-[#c3d0e0]"}`}>
                          {deductedRules.map(r => (
                            <span key={r} className="flex items-center gap-1 rounded-lg bg-[#fdf4e6] py-0.5 pl-2 pr-1 text-[10px] text-[#b9791d]">
                              <span className="font-medium">{r}</span>
                              {ruleScoreMap[r] && <span className="font-semibold text-[#a3701a]">{ruleScoreMap[r]}</span>}
                              <button onClick={e => { e.stopPropagation(); toggleDeducted(r); }} className="grid size-3.5 place-items-center rounded text-[#c99a4e] hover:bg-[#f2e2c4] hover:text-[#8a5e10]"><X className="size-2.5" /></button>
                            </span>
                          ))}
                          <span className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] text-[#8b97a3]">
                            <Plus className="size-3" />{deductedRules.length > 0 ? "添加" : "点击选择扣分规则"}
                          </span>
                        </div>
                        {deductPickerOpen && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setDeductPickerOpen(false)} />
                            <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-xl border border-[#dde5ee] bg-white shadow-[0_12px_32px_rgba(41,53,66,.16)]">
                              <div className="border-b border-[#eef1f4] p-2">
                                <input autoFocus value={deductSearch} onChange={e => setDeductSearch(e.target.value)}
                                  placeholder="搜索规则名称…"
                                  className="h-7 w-full rounded-lg border border-[#e2e8f0] bg-[#fafbfd] px-2.5 text-[10px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] focus:bg-white" />
                              </div>
                              <div className="max-h-[180px] overflow-auto p-1.5">
                                {(() => {
                                  const kw = deductSearch.trim();
                                  const groups = ruleGroups
                                    .map(g => ({ ...g, rules: g.rules.filter(r => r.title.includes(kw)) }))
                                    .filter(g => g.rules.length > 0);
                                  if (groups.length === 0) return <div className="px-2 py-5 text-center text-[10px] text-[#b0bbc8]">未找到匹配的规则</div>;
                                  return groups.map(g => (
                                    <div key={`${g.scope}-${g.name}`} className="mb-1.5 last:mb-0">
                                      <div className="flex items-center gap-1.5 px-2 py-1">
                                        <span className={`rounded px-1 py-px text-[8px] font-medium ${g.scope === "通用" ? "bg-[#eef4ff] text-[#4b7ff0]" : "bg-[#eef7f1] text-[#3d8f63]"}`}>{g.scope}</span>
                                        <span className="text-[9px] font-medium text-[#98a3af]">{g.name}</span>
                                      </div>
                                      {g.rules.map(r => {
                                        const on = deductedRules.includes(r.title);
                                        return (
                                          <button key={r.title} onClick={() => toggleDeducted(r.title)}
                                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] transition ${on ? "bg-[#fdf4e6]" : "hover:bg-[#f4f6fa]"}`}>
                                            <span className={`grid size-3.5 shrink-0 place-items-center rounded-md border transition ${on ? "border-[#e59735] bg-[#e59735] text-white" : "border-[#cdd6e0] bg-white"}`}>{on && <Check className="size-2.5" />}</span>
                                            <span title={r.criteria} className={`flex-1 truncate ${on ? "font-medium text-[#b9791d]" : "text-[#5a6675]"}`}>{r.title}</span>
                                            {r.score && <span className={`shrink-0 text-[10px] font-semibold ${on ? "text-[#b9791d]" : "text-[#c56a63]"}`}>{r.score}</span>}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ));
                                })()}
                              </div>
                              <div className="flex items-center justify-between border-t border-[#eef1f4] bg-[#fafbfd] px-2.5 py-1.5">
                                <span className="text-[9px] text-[#a8b2be]">已选 {deductedRules.length} 项 · 仅列出对「{complaint.agentType}」生效的规则</span>
                                <button onClick={() => setDeductPickerOpen(false)} className="rounded-md bg-[#4b7ff0] px-2.5 py-1 text-[9px] font-medium text-white hover:bg-[#3d6fe0]">完成</button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-[10px] text-[#8b97a3]">对 AI 评分的意见</label>
                    <textarea value={detail} ref={detailRef}
                      onChange={e => { setDetail(e.target.value); if (err) setErr(""); }}
                      rows={3}
                      placeholder="期待听听您的专业意见——对上述每条规则，您认为应扣多少分？以及是否有需要调整的地方？"
                      className="w-full resize-none overflow-hidden rounded-xl border border-[#dbe3ee] bg-[#fafbfd] px-3 py-2.5 text-[11px] leading-relaxed text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0] focus:bg-white" />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] text-[#8b97a3]">对人工客服评分备注<span className="ml-1 text-[#a8b2be]">（选填）</span></label>
                    <textarea value={agentNote} ref={noteRef}
                      onChange={e => setAgentNote(e.target.value)}
                      rows={3}
                      placeholder="针对该客服本次表现的评分说明、改进建议等（将随最终结果反馈给客服）"
                      className="w-full resize-none overflow-hidden rounded-xl border border-[#dbe3ee] bg-[#fafbfd] px-3 py-2.5 text-[11px] leading-relaxed text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0] focus:bg-white" />
                  </div>

                  {err && <div className="flex items-center gap-1 text-[10px] text-[#d75d5d]"><AlertCircle className="size-3" />{err}</div>}

                  <div className="flex items-center justify-end gap-2 border-t border-[#eef1f4] pt-3">
                    <button onClick={agreeNoIssue} className="mr-auto text-[10px] text-[#8b97a3] transition hover:text-[#6b7a89]">撤销异议，改为认可</button>
                    <button onClick={submitObjection} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#5a8bf5] to-[#4b7ff0] px-4 py-2 text-[11px] font-medium text-white shadow-[0_4px_10px_rgba(75,127,240,.24)] transition hover:brightness-105"><Check className="size-3.5" />提交异议</button>
                  </div>
                </div>
              ) : (
                /* 已提交：只读展示，点「更新异议」才可编辑 */
                <div className="space-y-3.5">
                  {review!.objectedRules.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[10px] text-[#8b97a3]">有异议的评分规则</div>
                      <div className="flex flex-wrap gap-1.5">
                        {review!.objectedRules.map(r => (
                          <span key={r} className="rounded-full bg-[#eef4ff] px-2.5 py-1 text-[10px] font-medium text-[#4b7ff0]">{r}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="mb-1.5 text-[10px] text-[#8b97a3]">该客服应有的总分</div>
                    <span className={`text-[18px] font-bold ${Number(review!.suggestedScore) >= 90 ? "text-[#27955d]" : Number(review!.suggestedScore) >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]"}`}>{review!.suggestedScore}<span className="ml-0.5 text-[10px] font-normal text-[#a8b2be]">分</span></span>
                  </div>
                  {review!.deductedRules.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[10px] text-[#8b97a3]">该客服实际扣分的规则</div>
                      <div className="flex flex-wrap gap-1.5">
                        {review!.deductedRules.map(r => (
                          <span key={r} className="flex items-center gap-1.5 rounded-full bg-[#fdf4e6] px-2.5 py-1 text-[10px] text-[#b9791d]">
                            <span className="font-medium">{r}</span>
                            {ruleScoreMap[r] && <span className="rounded-full bg-[#f6e3c2] px-1.5 py-px text-[9px] font-semibold text-[#a3701a]">{ruleScoreMap[r]}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="mb-1.5 text-[10px] text-[#8b97a3]">对 AI 评分的意见</div>
                    <div className="whitespace-pre-wrap rounded-xl bg-[#f7f9fb] px-3 py-2.5 text-[11px] leading-relaxed text-[#3e4c5a]">{review!.detail || "—"}</div>
                  </div>
                  <div>
                    <div className="mb-1.5 text-[10px] text-[#8b97a3]">对人工客服评分备注</div>
                    <div className="whitespace-pre-wrap rounded-xl bg-[#f7f9fb] px-3 py-2.5 text-[11px] leading-relaxed text-[#3e4c5a]">{review!.agentNote || "—"}</div>
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t border-[#eef1f4] pt-3">
                    <button onClick={agreeNoIssue} className="mr-auto text-[10px] text-[#8b97a3] transition hover:text-[#6b7a89]">撤销异议，改为认可</button>
                    <button onClick={editObjection} className="flex items-center gap-1.5 rounded-xl border border-[#d9e2ee] bg-white px-3 py-2 text-[10px] text-[#4b7ff0] transition hover:bg-[#eef5ff]"><Pencil className="size-3" />更新异议</button>
                  </div>
                </div>
              )}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* 工单弹窗：查看客服提交的工单详情；无工单时显示空态 */}
      {workOrderOpen && (() => {
        const wo = complaint.workOrder;
        return (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-6" onClick={() => setWorkOrderOpen(false)}>
          <div className="flex max-h-[86vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(41,53,66,.32)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 border-b border-[#eef2f7] bg-gradient-to-b from-white to-[#f9fbff] px-5 py-3.5">
              <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#eaf1ff] to-[#dfeaff] text-[#4b7ff0]"><ClipboardCheck className="size-4" /></div>
              <div className="flex min-w-0 flex-col">
                <span className="text-[13px] font-semibold text-[#2f3b48]">客服提交的工单</span>
                <span className="text-[9px] text-[#a3adba]">{wo ? `工单号 ${wo.id} · 提交人 ${complaint.agent}` : `客服 ${complaint.agent} · 用户 ${complaint.user}`}</span>
              </div>
              <button onClick={() => setWorkOrderOpen(false)} className="ml-auto grid size-7 place-items-center rounded-lg text-[#9aa5b2] transition hover:bg-[#f2f5f9] hover:text-[#6b7a89]"><X className="size-4" /></button>
            </div>
            {!wo ? (
              <div className="flex flex-col items-center gap-2.5 px-5 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-[#f2f5fa] text-[#b8c3d2]"><ClipboardCheck className="size-6" /></div>
                <span className="text-[12px] font-medium text-[#6b7a89]">该客诉暂无工单</span>
                <span className="text-[10px] leading-relaxed text-[#a8b2be]">本次客诉客服未提交工单，可能已在会话中直接处理。</span>
              </div>
            ) : (
            <div className={`min-h-0 flex-1 overflow-auto px-5 py-4 ${scrollCls}`}>
              <div className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold text-[#333f4c]">描述<span className="text-[#d75d5d]">*</span></div>
              <dl className="space-y-2.5">
                {wo.fields.map((f, i) => (
                  <div key={i} className="flex gap-2 text-[11px] leading-relaxed">
                    <dt className="shrink-0 text-[#8b96a3]">{f.label}：</dt>
                    <dd className="min-w-0 flex-1 break-all text-[#3e4c5a]">{f.value || "—"}</dd>
                  </div>
                ))}
              </dl>
              {wo.attachments.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {wo.attachments.map((a, i) => (
                    <span key={i} className="flex items-center gap-1.5 text-[11px] text-[#4b7ff0]"><Download className="size-3.5" />{a}</span>
                  ))}
                </div>
              )}
              <div className="mt-5 grid grid-cols-2 gap-5 border-t border-[#eef1f4] pt-4">
                <div>
                  <div className="mb-1.5 text-[12px] font-semibold text-[#333f4c]">UID<span className="ml-0.5 text-[#d75d5d]">*</span></div>
                  <div className="text-[11px] text-[#3e4c5a]">{wo.uid || <span className="text-[#a8b2be]">暂无数据</span>}</div>
                </div>
                <div>
                  <div className="mb-1.5 text-[12px] font-semibold text-[#333f4c]">状态</div>
                  {wo.status ? (
                    <span className="inline-flex items-center rounded-md bg-[#eef4ff] px-2 py-0.5 text-[10px] font-medium text-[#4b7ff0]">{wo.status}</span>
                  ) : <span className="text-[11px] text-[#a8b2be]">暂无数据</span>}
                </div>
              </div>
              <div className="mt-5 border-t border-[#eef1f4] pt-4">
                <div className="mb-1.5 text-[12px] font-semibold text-[#333f4c]">工单关注人</div>
                <div className="text-[11px] text-[#3e4c5a]">{wo.watchers.length > 0 ? wo.watchers.join("、") : <span className="text-[#a8b2be]">暂无数据</span>}</div>
              </div>
              {wo.logs && wo.logs.length > 0 && (() => {
                const shown = logDesc ? wo.logs : [...wo.logs].slice().reverse();
                return (
                <div className="mt-5 overflow-hidden rounded-xl border border-[#e6ecf4]">
                  <div className="flex items-center gap-2 bg-[#f4f7fb] px-3.5 py-2.5">
                    <span className="text-[12px] font-semibold text-[#333f4c]">历史记录</span>
                    <button onClick={() => setLogDesc(v => !v)} title="切换排序" className="text-[#8b96a3] transition hover:text-[#4b7ff0]"><RefreshCw className="size-3" /></button>
                  </div>
                  <div className="bg-white px-3.5 py-3">
                    <div className="divide-y divide-[#f0f3f8]">
                      {shown.map((l, i) => (
                        <div key={i} className="flex gap-2.5 py-3 first:pt-0 last:pb-0">
                          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#eef1f6] to-[#e1e6ee] text-[9px] font-semibold text-[#697585]">{l.by.slice(0, 1)}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                              <span className="font-semibold text-[#333f4c]">{l.by}</span>
                              <span className="text-[#a3adba]">{l.at}</span>
                            </div>
                            <p className="mt-1 break-all text-[11px] leading-relaxed text-[#3e4c5a]">{l.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                );
              })()}
            </div>
            )}
          </div>
        </div>
        );
      })()}
    </div>
  );
}

// 报告模块各子页共用的头部（列表 / 选择任务 / 生成中 / 报告详情）。
function ReportHeader({ title, sub, back, right }: { title: string; sub: React.ReactNode; back?: () => void; right?: React.ReactNode }) {
  return (
    <header className="flex h-[58px] shrink-0 items-center justify-between gap-3 border-b border-[#e2e6eb] bg-white px-5">
      <div className="flex min-w-0 items-center gap-3">
        {back && (
          <button onClick={back} className="flex shrink-0 items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
            <ChevronRight className="size-3 rotate-180" />返回
          </button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold text-[#2f3b48]">{title}</h1>
          <p className="mt-0.5 text-[10px] text-[#8b96a3]">{sub}</p>
        </div>
      </div>
      {right}
    </header>
  );
}

// 报告状态在列表中的呈现：正在生成中 / 生成失败 / 已生成。
const REPORT_STATUS_META: Record<ReportStatus, { label: string; cls: string }> = {
  generating: { label: "正在生成中", cls: "bg-[#eef4ff] text-[#4b7ff0]" },
  failed: { label: "生成失败", cls: "bg-[#fdeceb] text-[#d75d5d]" },
  done: { label: "已生成", cls: "bg-[#e6f4ee] text-[#27955d]" },
};

// —— 新增报告弹窗 ——
// 与「新增质检任务」同一套交互：用户在这里为报告命名、写备注，并勾选要纳入的质检任务。
// 筛选任务是固定的三步向导：
//   步骤 1 选任务生效的规则版本（单选）→ 步骤 2 选任务提出时间（某日 / 时间段）→ 步骤 3 才出现任务列表。
// 前两步没选完，第三步不展示任务，避免用户面对一堆无意义的任务。
// 勾选几个任务，就基于这几个任务出一份报告；客诉未复审完的任务不可勾选。
function NewReportModal({ tasks, complaints, reviews, versions, onClose, onCreate }: {
  tasks: TaskRow[];
  complaints: Complaint[];
  reviews: Record<string, Review>;
  versions: RuleVersion[];
  onClose: () => void;
  onCreate: (d: ReportDraft) => void;
}) {
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [note, setNote] = useState("");
  // 步骤 1：生效的规则版本（单选）。
  const [ruleSel, setRuleSel] = useState<string>("");
  const [ruleOpen, setRuleOpen] = useState(false);
  // 步骤 2：任务提出时间，某日 or 时间段。
  const [dateMode, setDateMode] = useState<"day" | "range">("day");
  const [day, setDay] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState("");

  const isReviewed = (c: Complaint) => { const r = reviews[c.id]; return !!r && (r.agreed || r.submitted); };
  // 任务可否纳入报告：AI 质检已完成，且任务内客诉全部复审完毕。
  const taskState = (t: TaskRow) => {
    const rows = complaints.filter(c => t.complaintIds.includes(c.id));
    const done = rows.filter(isReviewed).length;
    if (t.status !== "已完成") return { ok: false, done, total: rows.length, why: t.status === "有异常" ? "AI 质检异常，无法纳入报告" : "AI 正在打分，暂不可纳入报告" };
    if (rows.length === 0) return { ok: false, done, total: 0, why: "该任务未纳入客诉" };
    if (done < rows.length) return { ok: false, done, total: rows.length, why: `客诉未审核完（${done}/${rows.length}），审核完成后可选` };
    return { ok: true, done, total: rows.length, why: "" };
  };
  // 任务提出日：兼容「时间段」形式的任务日期（取起始日）。
  const taskDay = (t: TaskRow) => t.date.slice(0, 10);
  const hitTime = (t: TaskRow) => {
    const d = taskDay(t);
    return dateMode === "day" ? d === day : d >= rangeFrom && d <= rangeTo;
  };

  // 任务中实际出现过的规则版本（按版本序号从新到旧）。
  const ruleOptions = Array.from(new Set(tasks.map(t => t.ruleVersion)))
    .map(id => {
      const v = versions.find(x => x.id === id);
      return { id, seq: v?.seq ?? (Number(id.replace(/\D/g, "")) || 0), note: v?.note ?? "", count: tasks.filter(t => t.ruleVersion === id).length };
    })
    .sort((a, b) => b.seq - a.seq);
  const selRule = ruleOptions.find(o => o.id === ruleSel) ?? null;

  // 两步都完成才展示任务列表：规则版本已选 + 时间已填完整。
  const timeReady = dateMode === "day" ? !!day : !!rangeFrom && !!rangeTo && rangeFrom <= rangeTo;
  const ready = !!ruleSel && timeReady;
  const matched = ready ? tasks.filter(t => t.ruleVersion === ruleSel && hitTime(t)).slice().sort((a, b) => (taskDay(a) < taskDay(b) ? 1 : -1)) : [];
  const pickedTasks = matched.filter(t => picked.includes(t.name));
  const selectableNames = matched.filter(t => taskState(t).ok).map(t => t.name);
  const dates = pickedTasks.map(t => taskDay(t)).sort();
  // 未手动命名时，按所选任务的时间范围给一个默认名。
  const autoName = dates.length === 0 ? "" : dates[0] === dates[dates.length - 1] ? `${dates[0]} 复审报告` : `${dates[0]} 至 ${dates[dates.length - 1]} 复审报告`;
  const effectiveName = nameTouched ? name : autoName;

  // 改动筛选条件时清空已勾选，避免选中「当前已看不到」的任务。
  const resetPick = () => { setPicked([]); if (err) setErr(""); };
  const togglePick = (n: string) => { setPicked(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]); if (err) setErr(""); };
  const pickRule = (id: string) => { setRuleSel(id); setRuleOpen(false); resetPick(); };

  function submit() {
    if (!effectiveName.trim()) { setErr("请填写报告名称"); return; }
    if (!ruleSel) { setErr("请先选择任务生效的规则版本"); return; }
    if (!timeReady) { setErr(dateMode === "day" ? "请选择任务提出的日期" : "请选择完整的任务提出时间段，且开始日期不能晚于结束日期"); return; }
    if (pickedTasks.length === 0) { setErr("请至少勾选一个任务，报告将基于所选任务生成"); return; }
    onCreate({
      title: effectiveName.trim(),
      note: note.trim(),
      rangeFrom: dates[0],
      rangeTo: dates[dates.length - 1],
      taskNames: pickedTasks.map(t => t.name),
      ruleVersions: Array.from(new Set(pickedTasks.map(t => t.ruleVersion))),
    });
  }

  const segBtn = (on: boolean) => `rounded-md px-2.5 py-1 text-[10px] font-medium transition ${on ? "bg-white text-[#4b7ff0] shadow-sm" : "text-[#8b97a3] hover:text-[#5a6572]"}`;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-6" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-[520px] flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_rgba(41,53,66,.28)]" onClick={e => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-[#e9edf0] px-5 py-3.5">
          <div>
            <div className="text-[13px] font-semibold text-[#2f3b48]">新增报告</div>
            <div className="mt-0.5 text-[10px] text-[#8b96a3]">选择要纳入的质检任务，系统会基于这些任务统一生成一份复审报告</div>
          </div>
          <button onClick={onClose} className="text-[#85919d] hover:text-[#3e4c5a]"><X className="size-4" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-auto px-5 py-4">
          <div className="flex items-start gap-2 rounded-lg border border-[#dbe6f6] bg-[#f6f9ff] px-3 py-2 text-[10px] leading-relaxed text-[#5b6b81]">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-[#4b7ff0]" />
            <span>勾选几个任务，就会基于这些任务的全部复审数据出<span className="font-medium text-[#3562c8]">一份</span>报告。仅当任务内客诉全部复审完毕时才可勾选。</span>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[#5a6572]">报告名称 <span className="text-[#e59735]">*</span></label>
            <input value={effectiveName} onChange={e => { setNameTouched(true); setName(e.target.value); if (err) setErr(""); }} placeholder="如：十月第二周复审报告"
              className="h-9 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-[12px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]" />
            {!nameTouched && autoName && <div className="mt-1 text-[10px] text-[#a8b2be]">已按所选任务时间自动命名，可直接修改</div>}
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[#5a6572]">备注</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="选填，如：用于十月月度质检复盘"
              className="w-full resize-none rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-[12px] leading-relaxed text-[#3e4c5a] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]" />
          </div>

          {/* 步骤 1：任务生效的规则版本（单选） */}
          <div className="rounded-lg border border-[#e2e8f0] bg-[#fbfcfe] p-3">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="rounded bg-[#eef4ff] px-1.5 py-0.5 text-[9px] font-medium text-[#4b7ff0]">步骤 1</span>
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-[#5a6572]"><SlidersHorizontal className="size-3.5 text-[#4b7ff0]" />任务生效的规则版本 <span className="text-[#e59735]">*</span></label>
              <span className="text-[10px] text-[#98a3af]">单选</span>
            </div>
            <button onClick={() => setRuleOpen(o => !o)}
              className="flex w-full items-center gap-2 rounded-md border border-[#dbe3ee] bg-white px-2.5 py-2 text-left text-[11px] text-[#3e4c5a] hover:border-[#4b7ff0]">
              {selRule ? (
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-[#dbe4f2] bg-[#f4f8ff] px-1.5 py-0.5 text-[9px] font-medium text-[#3d6fe0]">规则 {selRule.id}</span>
                  <span className="text-[10px] text-[#8794a0]">{selRule.count} 个任务</span>
                  {selRule.note && <span className="min-w-0 truncate text-[10px] text-[#a8b2be]">{selRule.note}</span>}
                </span>
              ) : (
                <span className="min-w-0 flex-1 text-[#b5bfc9]">请选择规则版本</span>
              )}
              <ChevronRight className={`size-3.5 shrink-0 text-[#a3adba] transition ${ruleOpen ? "rotate-90" : ""}`} />
            </button>
            {ruleOpen && (
              <div className="mt-1.5 max-h-[150px] overflow-auto rounded-md border border-[#e6edf6] bg-white">
                {ruleOptions.map(o => {
                  const on = ruleSel === o.id;
                  return (
                    <button key={o.id} onClick={() => pickRule(o.id)}
                      className={`flex w-full items-start gap-2 border-b border-[#f2f5f9] px-2.5 py-2 text-left last:border-b-0 transition ${on ? "bg-[#f4f8ff]" : "hover:bg-[#fafbfd]"}`}>
                      <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition ${on ? "border-[#4b7ff0] bg-[#4b7ff0]" : "border-[#c9d5e5] bg-white"}`}>
                        {on && <span className="size-1.5 rounded-full bg-white" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full border border-[#dbe4f2] bg-[#f4f8ff] px-1.5 py-0.5 text-[9px] font-medium text-[#3d6fe0]">规则 {o.id}</span>
                          <span className="text-[10px] text-[#8794a0]">{o.count} 个任务</span>
                        </div>
                        {o.note && <div className="mt-0.5 truncate text-[10px] text-[#a8b2be]">{o.note}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 步骤 2：任务提出时间（某日 / 时间段） */}
          <div className={`rounded-lg border p-3 transition ${ruleSel ? "border-[#e2e8f0] bg-[#fbfcfe]" : "border-[#eaeef3] bg-[#fbfcfd] opacity-60"}`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-[#eef4ff] px-1.5 py-0.5 text-[9px] font-medium text-[#4b7ff0]">步骤 2</span>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-[#5a6572]"><CalendarDays className="size-3.5 text-[#4b7ff0]" />任务提出时间 <span className="text-[#e59735]">*</span></label>
              </div>
              <div className="flex rounded-lg border border-[#e2e8f0] bg-white p-0.5">
                <button disabled={!ruleSel} onClick={() => { setDateMode("day"); resetPick(); }} className={segBtn(dateMode === "day")}>某日</button>
                <button disabled={!ruleSel} onClick={() => { setDateMode("range"); resetPick(); }} className={segBtn(dateMode === "range")}>时间段</button>
              </div>
            </div>
            {!ruleSel ? (
              <div className="text-[10px] text-[#a8b2be]">请先在步骤 1 选择规则版本。</div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {dateMode === "day" ? (
                  <>
                    <input type="date" value={day} onChange={e => { setDay(e.target.value); resetPick(); }}
                      className="h-8 rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
                    {day && <button onClick={() => { setDay(""); resetPick(); }} title="清除日期" className="text-[#a0acb8] hover:text-[#d75d5d]"><X className="size-3.5" /></button>}
                  </>
                ) : (
                  <>
                    <input type="date" value={rangeFrom} onChange={e => { setRangeFrom(e.target.value); resetPick(); }}
                      className="h-8 rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
                    <span className="text-[10px] text-[#b0bbc8]">—</span>
                    <input type="date" value={rangeTo} onChange={e => { setRangeTo(e.target.value); resetPick(); }}
                      className="h-8 rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
                    {(rangeFrom || rangeTo) && <button onClick={() => { setRangeFrom(""); setRangeTo(""); resetPick(); }} title="清除时间段" className="text-[#a0acb8] hover:text-[#d75d5d]"><X className="size-3.5" /></button>}
                  </>
                )}
                {!timeReady && <span className="ml-auto text-[10px] text-[#c58a4a]">{dateMode === "day" ? "请选择日期" : rangeFrom && rangeTo ? "开始日期不能晚于结束日期" : "请选择起止日期"}</span>}
              </div>
            )}
          </div>

          {/* 步骤 3：前两步选完后才出现任务列表 */}
          {!ready ? (
            <div className="rounded-lg border border-dashed border-[#dce3ec] bg-[#fbfcfd] px-4 py-8 text-center">
              <div className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-[#f2f5fa] text-[#b0bbc8]"><Inbox className="size-5" /></div>
              <div className="text-[11px] font-medium text-[#6b7a89]">{!ruleSel ? "选择规则版本与任务提出时间后，这里会列出可选任务" : "选择任务提出时间后，这里会列出可选任务"}</div>
              <div className="mt-1 text-[10px] text-[#a8b2be]">任务列表将同时满足所选的规则版本与时间条件。</div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[#e2e8f0]">
              <div className="flex flex-wrap items-center gap-2 border-b border-[#eef1f4] bg-[#f7f9fc] px-3 py-2">
                <span className="rounded bg-[#eef4ff] px-1.5 py-0.5 text-[9px] font-medium text-[#4b7ff0]">步骤 3</span>
                <span className="text-[11px] font-medium text-[#5a6572]">选择任务 <span className="text-[#e59735]">*</span></span>
                <span className="text-[10px] text-[#98a3af]">已选 <span className="font-semibold text-[#4b7ff0]">{pickedTasks.length}</span> 个</span>
                <button onClick={() => { setPicked(selectableNames); if (err) setErr(""); }} disabled={selectableNames.length === 0}
                  className={`ml-auto text-[10px] ${selectableNames.length === 0 ? "cursor-not-allowed text-[#c4ccd6]" : "text-[#4b7ff0] hover:underline"}`}>全选可用</button>
              </div>
              {matched.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <div className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-[#f2f5fa] text-[#b0bbc8]"><Inbox className="size-5" /></div>
                  <div className="text-[11px] font-medium text-[#6b7a89]">没有符合筛选条件的质检任务</div>
                  <div className="mt-1 text-[10px] text-[#a8b2be]">请调整规则版本或时间条件，或先在「任务管理」中创建任务。</div>
                </div>
              ) : (
                <div className="max-h-[230px] divide-y divide-[#f0f3f8] overflow-auto">
                  {matched.map(t => {
                    const st = taskState(t);
                    const on = picked.includes(t.name);
                    return (
                      <button key={t.name} onClick={() => st.ok && togglePick(t.name)} disabled={!st.ok}
                        className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition ${!st.ok ? "cursor-not-allowed bg-[#fcfdfe]" : on ? "bg-[#f4f8ff]" : "hover:bg-[#fafbfd]"}`}>
                        <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-[5px] border transition ${!st.ok ? "border-[#e2e8f0] bg-[#f2f5fa]" : on ? "border-[#4b7ff0] bg-[#4b7ff0]" : "border-[#c9d5e5] bg-white"}`}>
                          {on && <Check className="size-3 text-white" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`text-[11.5px] font-medium ${st.ok ? "text-[#35414e]" : "text-[#98a3af]"}`}>{t.name}</span>
                            {st.ok && <span className="rounded-full bg-[#e6f4ee] px-1.5 py-0.5 text-[9px] font-medium text-[#27955d]">客诉已审完</span>}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-[#8794a0]">
                            <span className="flex items-center gap-1"><Clock className="size-3" />提出时间 {t.date}</span>
                            <span>复审 {st.done}/{st.total}</span>
                            {t.note && <span className="text-[#a8b2be]">{t.note}</span>}
                          </div>
                          {!st.ok && <div className="mt-0.5 text-[10px] text-[#c58a4a]">{st.why}</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {err && <div className="rounded-md bg-[#fff0f0] px-3 py-2 text-[10px] text-[#d75d5d]">{err}</div>}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#e9edf0] px-5 py-3">
          <span className="text-[10px] text-[#8b97a3]">
            {pickedTasks.length === 0 ? "尚未选择任务" : <>将基于 <span className="font-semibold text-[#4b7ff0]">{pickedTasks.length}</span> 个任务生成 1 份报告</>}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-md border border-[#d9e2ee] bg-white px-3 py-1.5 text-[11px] text-[#6b7a89] hover:bg-[#f2f5f9]">取消</button>
            <button onClick={submit} className="flex items-center gap-1.5 rounded-md bg-[#4b7ff0] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#3f72e0]"><Plus className="size-3.5" />新增报告</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// —— 查看报告（仅超级管理员）——
// 报告不再挂在单个任务下：管理员先「新增报告」（命名 + 备注 + 勾选任务），系统随后异步生成内容。
// 列表可见每条报告的状态（正在生成中 / 生成失败 / 已生成）；失败可重新生成，已生成的报告内容固化保存。
function ReportsPage({ tasks, complaints, reviews, versions, reports, onCreateReport, onRegenerate, onDeleteReport, onUpdateNote }: {
  tasks: TaskRow[];
  complaints: Complaint[];
  reviews: Record<string, Review>;
  versions: RuleVersion[];
  reports: SavedReport[];
  onCreateReport: (d: ReportDraft) => string;
  onRegenerate: (id: string) => void;
  onDeleteReport: (id: string) => void;
  onUpdateNote: (id: string, note: string) => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ id: string; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const Header = ReportHeader;

  // —— 报告详情（仅已生成的报告有内容可看）——
  const openReport = openId ? reports.find(r => r.id === openId && r.status === "done") ?? null : null;
  if (openReport) {
    const r = openReport;
    const hasChanges = r.dimOps.length > 0 || r.principleOps.length > 0;
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
        <Header
          title={r.title}
          sub={
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-full border border-[#dbe4f2] bg-[#f4f8ff] px-1.5 py-0.5 font-medium text-[#3d6fe0]" title="报告依据各任务创建时锁定的规则版本生成">依据规则 {r.ruleVersions.join("、")}</span>
              <span>含 {r.taskNames.length} 个任务、{r.complaintCount} 条客诉（{r.agreedCount} 条认可 AI 评分，{r.objectionCount} 条提出修改意见），涉及 {r.dimOps.length} 条评分维度、{r.principleOps.length} 条评分原则需优化</span>
              <span className="text-[#b0bbc8]">· 新增于 {r.createdAt} · {r.createdBy}{r.generatedAt ? ` · 生成完成 ${r.generatedAt}` : ""}</span>
            </span>
          }
          back={() => setOpenId(null)}
        />
        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="mx-auto max-w-[640px] space-y-3">
            {/* 备注（可自定义） */}
            <div className="rounded-lg border border-[#dce6f4] bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <Pencil className="size-3.5 text-[#4b7ff0]" />
                <span className="text-[12px] font-semibold text-[#35414e]">备注</span>
                {noteDraft?.id !== r.id && (
                  <button onClick={() => setNoteDraft({ id: r.id, text: r.note })} className="ml-auto text-[10px] text-[#4b7ff0] hover:underline">{r.note ? "编辑" : "添加备注"}</button>
                )}
              </div>
              {noteDraft?.id === r.id ? (
                <div>
                  <textarea value={noteDraft.text} onChange={e => setNoteDraft({ id: r.id, text: e.target.value })} rows={3} placeholder="记录本次报告的结论、待跟进事项等…"
                    className="w-full resize-none rounded-md border border-[#dbe3ee] px-2.5 py-2 text-[11px] leading-relaxed text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={() => { onUpdateNote(r.id, noteDraft.text); setNoteDraft(null); }} className="flex items-center gap-1 rounded-md bg-[#4b7ff0] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#3f72e0]"><Check className="size-3.5" />保存</button>
                    <button onClick={() => setNoteDraft(null)} className="rounded-md border border-[#dbe3ee] px-3 py-1.5 text-[11px] text-[#7c8896] hover:bg-[#f4f7fb]">取消</button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-line text-[11px] leading-relaxed text-[#4d5966]">{r.note || <span className="text-[#a8b2be]">暂无备注</span>}</p>
              )}
            </div>

            {/* 报告范围 */}
            <div className="rounded-lg border border-[#dce6f4] bg-white p-4">
              <div className="mb-2 text-[12px] font-semibold text-[#35414e]">报告范围</div>
              <div className="mb-2 text-[10px] text-[#8794a0]">任务提出时间 {r.rangeFrom} — {r.rangeTo}</div>
              <div className="flex flex-wrap gap-1.5">
                {r.taskNames.map(n => <span key={n} className="rounded-full bg-[#f2f5fa] px-2 py-0.5 text-[10px] text-[#5a6675]">{n}</span>)}
              </div>
            </div>

            {/* 一、复审总结 */}
            <div className="rounded-lg border border-[#dbe6f6] bg-[#f6f9ff] px-4 py-3 text-[11px] leading-relaxed text-[#4d5966]">
              <div className="mb-1 font-semibold text-[#3562c8]">一、复审总结</div>
              {!hasChanges ? (
                <span className="text-[#6b7a89]">本报告范围内共 {r.complaintCount} 条客诉全部完成人工复审，质检人员对 AI 评分均予认可，未发现需要调整的规则或评分原则，AI 当前判定与人工判断一致。</span>
              ) : (
                <span className="text-[#6b7a89]">本报告范围覆盖 {r.taskNames.length} 个质检任务、共 {r.complaintCount} 条客诉，其中 {r.agreedCount} 条认可 AI 评分、{r.objectionCount} 条提出修改意见。人工复审反映出 AI 在若干评分维度上判定与人工存在偏差：部分维度高频误扣需收紧或删除，个别场景 AI 存在漏扣需补充维度。综合来看，AI 评分整体方向可用，但需按下列建议调整评分维度（修改/新增/删除）并同步优化评分原则，使自动评分进一步贴合人工判断。</span>
              )}
            </div>

            {/* 二、建议调整的评分维度 */}
            {r.dimOps.length > 0 && (
              <div className="rounded-lg border border-[#dce6f4] bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[#35414e]">二、建议调整的评分维度</span>
                  <span className="text-[10px] text-[#98a3af]">修改/删除按存疑概率从高到低</span>
                </div>
                <div className="space-y-2.5">
                  {r.dimOps.map((e, idx) => {
                    const opColor = e.op === "新增" ? "bg-[#e6f4ee] text-[#27955d]" : e.op === "删除" ? "bg-[#fdeceb] text-[#d75d5d]" : "bg-[#eef4ff] text-[#4b7ff0]";
                    return (
                      <div key={`${e.op}-${e.title}`} className="rounded-md border border-[#e6edf6] bg-[#fbfcfe] p-3">
                        <div className="mb-1.5 flex items-center gap-2">
                          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#f0f2f5] text-[10px] font-semibold text-[#6b7a89]">{idx + 1}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${opColor}`}>{e.op}</span>
                          <span className="rounded bg-[#eef4ff] px-2 py-0.5 text-[11px] font-medium text-[#4b7ff0]">{e.title}</span>
                          <span className="rounded-full bg-[#f0f2f5] px-1.5 py-0.5 text-[9px] text-[#6b7a89]">{e.scope}规则 · {e.catName}</span>
                          {e.op !== "新增" && (
                            <span className="ml-auto flex items-center gap-1 text-[10px]">
                              <span className="text-[#98a3af]">存疑概率</span>
                              <span className={`font-semibold ${e.prob >= 60 ? "text-[#d75d5d]" : e.prob >= 30 ? "text-[#e59735]" : "text-[#4b7ff0]"}`}>{e.prob}%</span>
                            </span>
                          )}
                        </div>
                        {e.op !== "新增" && (
                          <div className="mb-1.5 flex items-center gap-1.5">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#eef1f5]">
                              <div className={`h-full rounded-full ${e.prob >= 60 ? "bg-[#d75d5d]" : e.prob >= 30 ? "bg-[#e59735]" : "bg-[#4b7ff0]"}`} style={{ width: `${e.prob}%` }} />
                            </div>
                            <span className="text-[9px] text-[#98a3af]">{e.freq} 次被推翻</span>
                          </div>
                        )}
                        <div className="mb-1.5 rounded bg-[#f7f9fb] px-2 py-1 text-[9px] leading-relaxed text-[#8794a0]">{e.reason}</div>
                        {e.op === "修改" && (
                          <div className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-[10px]">
                            <span className="text-[#8794a0]">维度名称</span>
                            <span className="font-medium text-[#465260]">{e.title}</span>
                            <span className="text-[#8794a0]">现判断标准</span>
                            <span className="leading-relaxed text-[#9aa4b0] line-through decoration-[#d0d6de]">{e.oldCriteria || "—"}</span>
                            <span className="text-[#8794a0]">建议改为</span>
                            <span className="leading-relaxed text-[#27955d]">{e.newCriteria}</span>
                          </div>
                        )}
                        {e.op === "新增" && (
                          <div className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-[10px]">
                            <span className="text-[#8794a0]">维度名称</span>
                            <span className="font-medium text-[#465260]">{e.title}{e.score ? `（${e.score} 分）` : ""}</span>
                            <span className="text-[#8794a0]">说明</span>
                            <span className="leading-relaxed text-[#4d5966]">{e.standard || "—"}</span>
                            <span className="text-[#8794a0]">判断标准</span>
                            <span className="leading-relaxed text-[#27955d]">{e.newCriteria}</span>
                          </div>
                        )}
                        {e.op === "删除" && (
                          <div className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-[10px]">
                            <span className="text-[#8794a0]">现判断标准</span>
                            <span className="leading-relaxed text-[#9aa4b0] line-through decoration-[#d0d6de]">{e.oldCriteria || "—"}</span>
                            <span className="text-[#8794a0]">处理</span>
                            <span className="leading-relaxed text-[#d75d5d]">建议整体删除该维度，后续不再据此扣分。</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 三、建议调整的评分原则 */}
            {r.principleOps.length > 0 && (
              <div className="rounded-lg border border-[#dce6f4] bg-white p-4">
                <div className="mb-2 text-[12px] font-semibold text-[#35414e]">三、建议调整的评分原则</div>
                <div className="space-y-2">
                  {r.principleOps.map((op, i) => (
                    <div key={i} className="rounded-md border border-[#e6edf6] bg-[#fbfcfe] p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${op.op === "新增" ? "bg-[#e6f4ee] text-[#27955d]" : op.op === "删除" ? "bg-[#fdeceb] text-[#d75d5d]" : "bg-[#eef4ff] text-[#4b7ff0]"}`}>{op.op}</span>
                        <span className="text-[11px] font-medium text-[#465260]">{op.title}</span>
                      </div>
                      {op.op === "修改" && (
                        <div className="grid grid-cols-[52px_1fr] gap-x-2 gap-y-1 text-[10px]">
                          <span className="text-[#8794a0]">原内容</span>
                          <span className="leading-relaxed text-[#9aa4b0] line-through decoration-[#d0d6de]">{op.oldContent}</span>
                          <span className="text-[#8794a0]">改为</span>
                          <span className="leading-relaxed text-[#27955d]">{op.newContent}</span>
                        </div>
                      )}
                      {op.op === "新增" && <div className="text-[10px] leading-relaxed text-[#27955d]">{op.newContent}</div>}
                      {op.op === "删除" && <div className="text-[10px] leading-relaxed text-[#8a5a5a]">建议删除该原则：{op.oldContent}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // —— 报告列表 ——
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <Header
        title="查看报告"
        sub={reports.length === 0 ? "基于质检任务的复审情况，生成可长期保存的复审报告。" : "新增报告时勾选要纳入的质检任务，系统随后生成一份统一的复审报告；已生成的报告长期保存，可加备注或删除。"}
        right={
          // 列表为空时入口只留空态里那一个，避免同屏出现两个「新增报告」。
          reports.length === 0 ? undefined : (
            <button onClick={() => setShowNew(true)}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-[#4b7ff0] px-3 text-[11px] font-medium text-white hover:bg-[#3f72e0]">
              <Plus className="size-3.5" />新增报告
            </button>
          )
        }
      />
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-[720px]">
          {reports.length === 0 ? (
            <div className="rounded-lg border border-[#dce6f4] bg-white px-6 py-16 text-center">
              <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-[#f2f5fa] text-[#b0bbc8]"><FileText className="size-6" /></div>
              <div className="text-[13px] font-medium text-[#5a6675]">目前报告列表为空</div>
              <div className="mx-auto mt-1.5 max-w-[420px] text-[11px] leading-relaxed text-[#a8b2be]">你可以自己设定范围来生成一份报告：先选定任务生效的规则版本，再选定任务提出的日期或时间段，勾选要纳入的质检任务并为报告命名，系统会基于这些任务统一分析并生成复审报告。</div>
              <button onClick={() => setShowNew(true)} className="mx-auto mt-5 flex items-center gap-1.5 rounded-md bg-[#4b7ff0] px-3.5 py-2 text-[11px] font-medium text-white hover:bg-[#3f72e0]"><Plus className="size-3.5" />新增报告</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {reports.map(r => {
                const meta = REPORT_STATUS_META[r.status];
                const done = r.status === "done";
                return (
                  <div key={r.id} className="overflow-hidden rounded-xl border border-[#e6ecf4] bg-white shadow-[0_1px_2px_rgba(20,40,80,0.04)] transition hover:border-[#c3d6f4]">
                    <div className="flex items-start gap-3 px-4 py-3.5">
                      <div className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${r.status === "failed" ? "bg-[#fdeeee] text-[#d75d5d]" : "bg-gradient-to-br from-[#eef4ff] to-[#e2ecff] text-[#4b7ff0]"}`}>
                        {r.status === "generating" ? <RefreshCw className="size-4 animate-spin" /> : r.status === "failed" ? <AlertCircle className="size-4" /> : <FileText className="size-4" />}
                      </div>
                      <button onClick={() => done && setOpenId(r.id)} disabled={!done} className={`min-w-0 flex-1 text-left ${done ? "" : "cursor-default"}`}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[12.5px] font-semibold text-[#2f3b48]">{r.title}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${meta.cls}`}>{meta.label}</span>
                          <span className="rounded-full border border-[#dbe4f2] bg-[#f4f8ff] px-1.5 py-0.5 text-[9px] font-medium text-[#3d6fe0]">规则 {r.ruleVersions.join("、")}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-[#8794a0]">
                          <span className="flex items-center gap-1"><CalendarDays className="size-3" />{r.rangeFrom} — {r.rangeTo}</span>
                          <span>{r.taskNames.length} 个任务</span>
                          {done && <><span>{r.complaintCount} 条客诉</span><span>{r.dimOps.length} 条维度建议</span><span>{r.principleOps.length} 条原则建议</span></>}
                        </div>
                        <div className="mt-1 text-[10px] text-[#a8b2be]">新增于 {r.createdAt} · {r.createdBy}{done && r.generatedAt ? ` · 生成完成 ${r.generatedAt}` : ""}</div>
                        {r.note && <div className="mt-1.5 truncate rounded bg-[#f7f9fb] px-2 py-1 text-[10px] text-[#6b7a89]">备注：{r.note}</div>}
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => setNoteDraft({ id: r.id, text: r.note })} title="编辑备注" className="grid size-7 place-items-center rounded-md text-[#a3adba] transition hover:bg-[#f2f5fa] hover:text-[#4b7ff0]"><Pencil className="size-3.5" /></button>
                        <button onClick={() => setConfirmDel(r.id)} title="删除报告" className="grid size-7 place-items-center rounded-md text-[#a3adba] transition hover:bg-[#fdeeee] hover:text-[#d75d5d]"><Trash2 className="size-3.5" /></button>
                        {done && <button onClick={() => setOpenId(r.id)} title="查看报告" className="grid size-7 place-items-center rounded-md text-[#a3adba] transition hover:bg-[#f2f5fa] hover:text-[#4b7ff0]"><ChevronRight className="size-4" /></button>}
                      </div>
                    </div>

                    {/* 生成中：进度条 */}
                    {r.status === "generating" && (
                      <div className="border-t border-[#f0f3f8] bg-[#fbfcfe] px-4 py-2.5">
                        <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-[#e9eef5]">
                          <div className="h-full rounded-full bg-[#4b7ff0] transition-all duration-300" style={{ width: `${r.progress ?? 0}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-[#8b97a3]">
                          <span>{r.attempts > 1 ? `第 ${r.attempts} 次尝试：正在重新分析所选 ${r.taskNames.length} 个任务的复审数据…` : `系统正在基于所选 ${r.taskNames.length} 个任务分析复审数据…`}</span>
                          <span>{r.progress ?? 0}%</span>
                        </div>
                      </div>
                    )}

                    {/* 生成失败：中断位置 + 原因 + 重新生成 */}
                    {r.status === "failed" && (
                      <div className="border-t border-[#f6e3e3] bg-[#fdf7f7] px-4 py-2.5">
                        <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-[#f5e2e2]">
                          <div className="h-full rounded-full bg-[#d75d5d]" style={{ width: `${r.progress ?? 0}%` }} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <AlertCircle className="size-3.5 shrink-0 text-[#d75d5d]" />
                          <span className="min-w-0 flex-1 text-[10px] leading-relaxed text-[#a86363]">
                            {r.failReason || "生成失败，请重新生成。"}
                            <span className="ml-1 text-[#c09090]">中断于 {r.progress ?? 0}%{r.failedAt ? ` · ${r.failedAt}` : ""}{r.attempts > 1 ? ` · 已尝试 ${r.attempts} 次` : ""}</span>
                          </span>
                          <button onClick={() => onRegenerate(r.id)} className="flex shrink-0 items-center gap-1 rounded-md bg-[#4b7ff0] px-2.5 py-1.5 text-[10px] font-medium text-white hover:bg-[#3f72e0]"><RotateCcw className="size-3" />重新生成</button>
                        </div>
                      </div>
                    )}

                    {noteDraft?.id === r.id && (
                      <div className="border-t border-[#f0f3f8] bg-[#fbfcfe] px-4 py-3">
                        <textarea value={noteDraft.text} onChange={e => setNoteDraft({ id: r.id, text: e.target.value })} rows={2} placeholder="记录本次报告的结论、待跟进事项等…"
                          className="w-full resize-none rounded-md border border-[#dbe3ee] bg-white px-2.5 py-2 text-[11px] leading-relaxed text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
                        <div className="mt-2 flex items-center gap-2">
                          <button onClick={() => { onUpdateNote(r.id, noteDraft.text); setNoteDraft(null); }} className="flex items-center gap-1 rounded-md bg-[#4b7ff0] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#3f72e0]"><Check className="size-3.5" />保存备注</button>
                          <button onClick={() => setNoteDraft(null)} className="rounded-md border border-[#dbe3ee] bg-white px-3 py-1.5 text-[11px] text-[#7c8896] hover:bg-[#f4f7fb]">取消</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 新增报告弹窗 */}
      {showNew && (
        <NewReportModal
          tasks={tasks} complaints={complaints} reviews={reviews} versions={versions}
          onClose={() => setShowNew(false)}
          onCreate={d => { onCreateReport(d); setShowNew(false); }}
        />
      )}

      {/* 删除确认 */}
      {confirmDel && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-6" onClick={() => setConfirmDel(null)}>
          <div className="w-full max-w-[340px] rounded-2xl bg-white p-5 shadow-[0_12px_40px_rgba(20,40,80,0.18)]" onClick={e => e.stopPropagation()}>
            <div className="mb-1.5 flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-full bg-[#fdeeee] text-[#d75d5d]"><Trash2 className="size-4" /></div>
              <span className="text-[13px] font-semibold text-[#2f3b48]">删除报告</span>
            </div>
            <p className="mb-4 text-[11px] leading-relaxed text-[#7c8896]">删除后该报告记录及其备注将不可恢复，任务与复审记录不受影响。确定删除「{reports.find(r => r.id === confirmDel)?.title}」吗？</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirmDel(null)} className="rounded-md border border-[#dbe3ee] px-3 py-1.5 text-[11px] text-[#7c8896] hover:bg-[#f4f7fb]">取消</button>
              <button onClick={() => { onDeleteReport(confirmDel); if (openId === confirmDel) setOpenId(null); setConfirmDel(null); }} className="rounded-md bg-[#d75d5d] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#c54f4f]">确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// —— 总结反馈（仅超级管理者）——
// 只做一张平铺的表：谁在哪个任务的哪条客诉上提的、针对哪几次历史客诉的总结、说了什么。
// 不做筛选、不做状态流转——超级管理者看完自己去调提示词即可，界面越简单越好落地。
// 业务管理者看不到本页（提示词调整权只在超级管理者手里）。
function SummaryFeedbackPage({ feedbacks }: { feedbacks: SummaryFeedback[] }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <ReportHeader
        title="总结反馈"
        sub={`质检人员与业务管理者对「玩家历史处理信息」提的反馈，共 ${feedbacks.length} 条。仅超级管理者可见。`}
      />
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-[1000px]">
          {feedbacks.length === 0 ? (
            <div className="rounded border border-[#e2e6eb] bg-white px-4 py-10 text-center text-[11px] text-[#a8b2be]">暂无反馈记录。</div>
          ) : (
            <div className="overflow-hidden rounded border border-[#e2e6eb] bg-white">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[#f4f7fb] text-left text-[10px] text-[#7c8896]">
                    <th className="border-b border-[#e9edf2] px-3 py-2 font-medium">提交时间</th>
                    <th className="border-b border-[#e9edf2] px-3 py-2 font-medium">提出人</th>
                    <th className="border-b border-[#e9edf2] px-3 py-2 font-medium">质检任务</th>
                    <th className="border-b border-[#e9edf2] px-3 py-2 font-medium">客诉序号</th>
                    <th className="border-b border-[#e9edf2] px-3 py-2 font-medium">总结取材的历史客诉</th>
                    <th className="border-b border-[#e9edf2] px-3 py-2 font-medium">反馈内容</th>
                  </tr>
                </thead>
                <tbody>
                  {feedbacks.map(f => (
                    <tr key={f.id} className="align-top">
                      <td className="whitespace-nowrap border-b border-[#f0f3f7] px-3 py-2 text-[#8794a0]">{f.at}</td>
                      <td className="whitespace-nowrap border-b border-[#f0f3f7] px-3 py-2 text-[#4d5966]">{f.by}（{roleLabel(f.byRole)}）</td>
                      <td className="border-b border-[#f0f3f7] px-3 py-2 text-[#4d5966]">{f.taskName}</td>
                      <td className="whitespace-nowrap border-b border-[#f0f3f7] px-3 py-2 text-[#4d5966]">{f.complaintId}<span className="ml-1 text-[10px] text-[#a8b2be]">客服 {f.agent}</span></td>
                      <td className="border-b border-[#f0f3f7] px-3 py-2 text-[#8794a0]">
                        {f.historyRefs.length === 0 ? "—" : f.historyRefs.map(h => `${h.id}（${h.date}）`).join("、")}
                      </td>
                      <td className="border-b border-[#f0f3f7] px-3 py-2 leading-relaxed text-[#4d5966]">{f.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// —— 评分维度（规则）——
// scopes：本规则对哪些客服类型生效。undefined / 空 视为「全部客服」，老数据不用迁移。
//   例：「缺乏耐心」只对一线客服生效 → scopes: ["一线客服"]。
// variants：只为「判断标准确实不一样」的客服类型留一条，稀疏存储，其余类型自动回落到 criteria。
//   例：「安抚不到位」对一线与 VIP 一线都生效，但 VIP 的标准更严 → variants: { VIP一线客服: "…" }。
//   分值与说明各类型统一（分叉只到判断标准这一层），避免同一条规则出现两套分数难以对账。
type Dim = { title: string; score: string; standard: string; criteria: string; scopes?: AgentType[]; variants?: Record<AgentType, string> };
// 规则对某客服类型是否生效：未配置 scopes 即视为全部生效。
const dimApplies = (d: Dim, t: AgentType) => !d.scopes || d.scopes.length === 0 || d.scopes.includes(t);
// 某客服类型实际会加载的判断标准：有专属变体用变体，否则用基准。
const criteriaFor = (d: Dim, t: AgentType) => d.variants?.[t] ?? d.criteria;
// 已分叉（与基准不同）的客服类型；只统计仍在生效范围内的，避免收窄后残留的变体虚报差异。
const variantTypes = (d: Dim): AgentType[] =>
  Object.entries(d.variants ?? {}).filter(([t, v]) => v !== d.criteria && dimApplies(d, t)).map(([t]) => t);
// 存盘前收敛：丢掉与基准一字不差的变体、以及已被移出生效范围的变体，
// 免得界面上显示「有差异」但点开发现两边一模一样。
function normalizeDim(d: Dim): Dim {
  const scopes = d.scopes && d.scopes.length > 0 ? d.scopes : undefined;
  const kept = Object.entries(d.variants ?? {}).filter(([t, v]) => v.trim() !== "" && v !== d.criteria && (!scopes || scopes.includes(t)));
  return { ...d, scopes, variants: kept.length > 0 ? Object.fromEntries(kept) : undefined };
}
// defaultScopes：本门类新增维度默认落在哪些客服类型上，只是个默认值，逐条仍可改。
type Cat = { name: string; expanded: boolean; enabled: boolean; renaming: boolean; dimensions: Dim[]; tags?: string[]; knowledgeIds?: string[]; defaultScopes?: AgentType[] };
type NewDimDraft = Dim;

// —— 规则版本管理 ——
const MAX_VERSIONS = 30;
type RuleVersion = { id: string; seq: number; note: string; author: string; savedAt: string; commonCats: Cat[]; privateCats: Cat[]; principles: Principle[] };
// 维度里的 scopes / variants 是引用类型，快照与工作副本之间必须各持一份，否则改一处会串到另一处。
const cloneDim = (d: Dim): Dim => ({ ...d, scopes: d.scopes ? [...d.scopes] : undefined, variants: d.variants ? { ...d.variants } : undefined });
const stripCat = (c: Cat) => ({ name: c.name, enabled: c.enabled, dimensions: c.dimensions.map(cloneDim), tags: c.tags ? [...c.tags] : undefined, knowledgeIds: c.knowledgeIds ? [...c.knowledgeIds] : undefined, defaultScopes: c.defaultScopes ? [...c.defaultScopes] : undefined });
// 仅比较规则内容，忽略展开/重命名等 UI 状态。
const rulesFingerprint = (common: Cat[], priv: Cat[], principles: Principle[]) =>
  JSON.stringify({ c: common.map(stripCat), p: priv.map(stripCat), r: principles });
// 载入某版本内容为工作副本时，重置 UI 状态。
const hydrateCat = (c: Cat): Cat => ({ name: c.name, enabled: c.enabled, expanded: false, renaming: false, dimensions: c.dimensions.map(cloneDim), tags: c.tags ? [...c.tags] : undefined, knowledgeIds: c.knowledgeIds ? [...c.knowledgeIds] : undefined, defaultScopes: c.defaultScopes ? [...c.defaultScopes] : undefined });
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const fmtVersionTime = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

// —— 生效客服类型编辑器 ——
// UX 取向是「默认按当前视角展示」：
//   1. 下拉多选设生效范围，默认全选，不点也是今天的行为；
//   2. 生效范围包含多类客服时，直接展开分类型判断标准；
//   3. 默认展示右上角视角选择器当前选中的客服类型，用户可切换查看其他类型；
//   4. 不额外展示「同基准 / 已改」状态，避免增加判断与维护复杂度。
function DimScopeEditor({ draft, patch, agentTypes, viewAs, scoreControl }: {
  draft: Dim;
  patch: (p: Partial<Dim>) => void;
  agentTypes: AgentType[];
  viewAs?: AgentType | null;
  scoreControl: React.ReactNode;
}) {
  const scopes = draft.scopes && draft.scopes.length > 0 ? draft.scopes : agentTypes;
  const allOn = scopes.length >= agentTypes.length;
  const forked = variantTypes(draft);
  const open = scopes.length >= 2;
  const defaultTab = viewAs && scopes.includes(viewAs) ? viewAs : scopes[0];
  const [scopePickerOpen, setScopePickerOpen] = useState(false);
  const [tab, setTab] = useState<AgentType | undefined>(defaultTab);

  React.useEffect(() => {
    if (defaultTab && !scopes.includes(tab ?? "")) setTab(defaultTab);
  }, [defaultTab, scopes, tab]);

  function toggleType(t: AgentType) {
    const next = scopes.includes(t) ? scopes.filter(x => x !== t) : [...agentTypes.filter(x => scopes.includes(x) || x === t)];
    // 一条都不勾＝永不生效的死规则，直接拦住。
    if (next.length === 0) return;
    // 移出范围的类型，其变体一并清掉，免得留下看不见却仍在库里的差异。
    const variants = Object.fromEntries(Object.entries(draft.variants ?? {}).filter(([k]) => next.includes(k)));
    patch({ scopes: next.length >= agentTypes.length ? undefined : next, variants: Object.keys(variants).length ? variants : undefined });
  }
  return (
    <>
      <div className="col-span-2 grid grid-cols-[70px_minmax(120px,160px)_70px_minmax(120px,160px)] items-start gap-x-3">
        <span className="pt-1 text-[#8794a0]">分值</span>
        {scoreControl}
        <span className="pt-1 text-[#8794a0]">生效客服类型</span>
        <div className="relative">
        <button
          type="button"
          onClick={() => setScopePickerOpen(o => !o)}
          className="flex h-7 w-full items-center justify-between rounded border border-[#dbe3ee] bg-white px-2 text-left text-[10px] text-[#3e4c5a] outline-none transition hover:border-[#c3d0e0] focus:border-[#4b7ff0]"
        >
          <span className="truncate">
            {allOn ? "全部客服" : scopes.length === 1 ? scopes[0] : `已选择 ${scopes.length} 类客服`}
          </span>
          <ChevronRight className={`ml-2 size-3 shrink-0 text-[#8b97a3] transition-transform ${scopePickerOpen ? "rotate-90" : ""}`} />
        </button>
        {scopePickerOpen && (
          <div className="absolute left-0 right-0 top-8 z-30 overflow-hidden rounded-md border border-[#dde5ee] bg-white shadow-[0_8px_24px_rgba(41,53,66,.16)]">
            <div className="flex items-center justify-between border-b border-[#eef1f4] bg-[#fafbfc] px-2.5 py-1.5">
              <span className="text-[9px] text-[#8794a0]">可多选</span>
              <button
                type="button"
                onClick={() => patch({ scopes: undefined, variants: undefined })}
                className="text-[9px] text-[#4b7ff0] hover:underline"
              >
                全选
              </button>
            </div>
            <div className="max-h-[180px] overflow-auto py-1">
              {agentTypes.map(t => {
                const on = scopes.includes(t);
                const only = on && scopes.length === 1;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    disabled={only}
                    title={only ? "至少需保留一类客服，否则该规则永不生效" : undefined}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] transition ${only ? "cursor-not-allowed opacity-60" : "hover:bg-[#f4f7fb]"}`}
                  >
                    <span className={`grid size-3.5 place-items-center rounded-sm border ${on ? "border-[#4b7ff0] bg-[#4b7ff0] text-white" : "border-[#cdd6e0] bg-white"}`}>
                      {on && <Check className="size-2.5" />}
                    </span>
                    <span className={on ? "font-medium text-[#3d6fe0]" : "text-[#465260]"}>{t}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      </div>

      <span className="pt-1 text-[#8794a0]">判断标准</span>
      {!open || scopes.length < 2 ? (
        <textarea value={draft.criteria} onChange={e => patch({ criteria: e.target.value })} rows={2}
          placeholder="描述如何判断扣分…"
          className="resize-none rounded border border-[#dbe3ee] bg-white px-2 py-1 text-[10px] leading-4 outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
      ) : (
        <div className="rounded border border-[#dbe3ee] bg-white">
          <div className="flex flex-wrap items-center gap-1 border-b border-[#eef1f4] bg-[#fafbfc] px-1.5 py-1.5">
            {scopes.map(t => {
              const active = t === tab;
              return (
                <button key={t} onClick={() => setTab(t)}
                  className={`rounded px-2 py-1 text-[10px] transition ${active ? "bg-[#4b7ff0] font-medium text-white" : "text-[#6b7a89] hover:bg-[#eef2f7]"}`}>
                  {t}
                </button>
              );
            })}
          </div>
          <textarea value={draft.variants?.[tab] ?? draft.criteria}
            onChange={e => patch({ variants: { ...(draft.variants ?? {}), [tab]: e.target.value } })}
            rows={3}
            placeholder="描述该客服类型下如何判断扣分…"
            className="w-full resize-none border-0 bg-white px-2 py-1.5 text-[10px] leading-4 outline-none placeholder-[#b5bfc9]"/>
        </div>
      )}
    </>
  );
}

function RulesList({
  label,
  sublabel,
  cats,
  setCats,
  targetRuleName,
  targetEditable,
  onTargetConsumed,
  onRulesModified,
  readOnly,
  showTags,
  knowledge,
  agentTypes,
  viewAs,
  setViewAs,
}: {
  label: string;
  sublabel: string;
  cats: Cat[];
  setCats: React.Dispatch<React.SetStateAction<Cat[]>>;
  targetRuleName?: string | null;
  targetEditable?: boolean;
  onTargetConsumed?: () => void;
  onRulesModified?: () => void;
  readOnly?: boolean;
  showTags?: boolean;
  knowledge?: KnowledgeItem[];
  agentTypes: AgentType[];
  // 「按客服类型预览」：选中某类型后，列表只留对它生效的规则，判断标准也换成该类型实际加载的那份。
  viewAs?: AgentType | null;
}) {
  const [menuOpenIdx, setMenuOpenIdx] = useState<number | null>(null);
  const [catNameDraft, setCatNameDraft] = useState("");
  const [tagDrafts, setTagDrafts] = useState<Record<number, string>>({});
  const [kbPickerIdx, setKbPickerIdx] = useState<number | null>(null);
  const [editingKey, setEditingKey] = useState<{ cat: number; dim: number } | null>(null);
  const [viewingKey, setViewingKey] = useState<{ cat: number; dim: number } | null>(null);
  const [dimDrafts, setDimDrafts] = useState<Record<string, Dim>>({});
  const [addingDim, setAddingDim] = useState<number | null>(null);
  const emptyDraft: NewDimDraft = { title: "", score: "", standard: "", criteria: "" };
  const [newDimDraft, setNewDimDraft] = useState<NewDimDraft>(emptyDraft);
  // 编辑面板里是否已展开「按客服类型分别设判断标准」，以及当前正在编哪一类的标准。
  // 默认收起——多数规则各类型标准一致，不该让所有人都面对一排 tab。
  const [detailTypeByKey, setDetailTypeByKey] = useState<Record<string, AgentType>>({});
  const dimRowRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  React.useEffect(() => {
    if (!targetRuleName) return;
    for (let ci = 0; ci < cats.length; ci++) {
      for (let di = 0; di < cats[ci].dimensions.length; di++) {
        if (cats[ci].dimensions[di].title === targetRuleName) {
          const key = `${ci}-${di}`;
          setCats(prev => prev.map((c, i) => i === ci ? { ...c, expanded: true } : c));
          if (targetEditable) {
            const dim = cats[ci].dimensions[di];
            setDimDrafts(prev => ({ ...prev, [key]: cloneDim(dim) }));
            setEditingKey({ cat: ci, dim: di });
            setViewingKey(null);
          } else {
            setEditingKey(null);
            setViewingKey({ cat: ci, dim: di });
          }
          setAddingDim(null);
          onTargetConsumed?.();
          setTimeout(() => dimRowRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
          return;
        }
      }
    }
  }, [targetRuleName]);

  function updateCat(idx: number, patch: Partial<Cat>) {
    setCats(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }
  function deleteCat(idx: number) {
    setCats(prev => prev.filter((_, i) => i !== idx));
    if (editingKey?.cat === idx) setEditingKey(null);
    if (addingDim === idx) setAddingDim(null);
  }
  function deleteDim(catIdx: number, dimIdx: number) {
    setCats(prev => prev.map((c, ci) => ci !== catIdx ? c : { ...c, dimensions: c.dimensions.filter((_, di) => di !== dimIdx) }));
    if (editingKey?.cat === catIdx && editingKey?.dim === dimIdx) setEditingKey(null);
    onRulesModified?.();
  }
  function addCat() {
    setCats(prev => [...prev, { name: "", expanded: false, enabled: true, renaming: true, dimensions: [], tags: showTags ? [] : undefined }]);
    setCatNameDraft("");
  }
  function addTag(catIdx: number, raw: string) {
    const t = raw.trim();
    if (!t) return;
    setCats(prev => prev.map((c, i) => i !== catIdx ? c : { ...c, tags: (c.tags ?? []).includes(t) ? c.tags : [...(c.tags ?? []), t] }));
    setTagDrafts(p => ({ ...p, [catIdx]: "" }));
    onRulesModified?.();
  }
  function removeTag(catIdx: number, tag: string) {
    setCats(prev => prev.map((c, i) => i !== catIdx ? c : { ...c, tags: (c.tags ?? []).filter(t => t !== tag) }));
    onRulesModified?.();
  }
  function toggleKnowledge(catIdx: number, id: string) {
    setCats(prev => prev.map((c, i) => i !== catIdx ? c : { ...c, knowledgeIds: (c.knowledgeIds ?? []).includes(id) ? c.knowledgeIds!.filter(x => x !== id) : [...(c.knowledgeIds ?? []), id] }));
    onRulesModified?.();
  }
  function saveDim(catIdx: number, dimIdx: number, draft: Dim) {
    setCats(prev => prev.map((c, ci) => ci !== catIdx ? c : {
      ...c,
      dimensions: c.dimensions.map((d, di) => di !== dimIdx ? d : normalizeDim({ ...d, ...draft })),
    }));
    setEditingKey(null);
    onRulesModified?.();
  }
  function saveNewDim(catIdx: number) {
    if (!newDimDraft.title.trim()) return;
    setCats(prev => prev.map((c, ci) => ci !== catIdx ? c : {
      ...c,
      dimensions: [...c.dimensions, normalizeDim({ ...newDimDraft })],
    }));
    setAddingDim(null);
    setNewDimDraft(emptyDraft);
    onRulesModified?.();
  }

  return (
    <div className="rounded-lg border border-[#e1e5e9] bg-white" onClick={() => setMenuOpenIdx(null)}>
      {/* 表头 */}
      <div className="flex items-center justify-between border-b border-[#e8ecf0] px-4 py-3">
        <div>
          <div className="text-[12px] font-semibold text-[#35414e]">{label}</div>
          <div className="mt-0.5 text-[10px] text-[#909ba6]">{sublabel}</div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); addCat(); }}
          className={`flex h-7 items-center gap-1 rounded border border-[#d5e0f5] bg-[#eaf2ff] px-2.5 text-[11px] text-[#4b7ff0] hover:bg-[#daeaff] ${readOnly ? "hidden" : ""}`}
        >
          <Plus className="size-3.5"/>添加
        </button>
      </div>

      {/* 空状态 */}
      {cats.length === 0 && (
        <div className="px-4 py-8 text-center text-[11px] text-[#b0bbc8]">暂无规则门类，点击右上角「添加」新建</div>
      )}

      {/* 一级门类列表 */}
      {cats.map((cat, catIdx) => {
        // viewAs 开启且整个门类都没有适用的规则时，连这个门类的外壳都不要渲染。
        if (viewAs && cat.dimensions.every(d => !dimApplies(d, viewAs))) return null;
        return (
        <div key={catIdx} className="border-b border-[#eef1f4] last:border-b-0">
          {/* 门类标题行 */}
          <div className="flex items-center gap-3 bg-[#fafbfc] px-4 py-2.5">
            <button onClick={() => updateCat(catIdx, { expanded: !cat.expanded })} className="grid size-5 place-items-center rounded text-[#718094] hover:bg-[#e9eef5]">
              <ChevronRight className={`size-4 transition-transform ${cat.expanded ? "rotate-90" : ""}`}/>
            </button>
            <div className="min-w-0 flex-1">
              {cat.renaming ? (
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <input
                    autoFocus
                    value={catNameDraft}
                    onChange={e => setCatNameDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && catNameDraft.trim()) updateCat(catIdx, { name: catNameDraft.trim(), renaming: false });
                      if (e.key === "Escape") { if (!cat.name) deleteCat(catIdx); else updateCat(catIdx, { renaming: false }); }
                    }}
                    placeholder="输入门类名称…"
                    className="h-6 w-36 rounded border border-[#4b7ff0] bg-white px-2 text-[12px] font-semibold text-[#3e4a57] outline-none placeholder-[#b5bfc9]"
                  />
                  <button onClick={() => { if (catNameDraft.trim()) updateCat(catIdx, { name: catNameDraft.trim(), renaming: false }); }} className="rounded bg-[#4b7ff0] px-1.5 py-0.5 text-[10px] text-white disabled:opacity-50">确认</button>
                  <button onClick={() => { if (!cat.name) deleteCat(catIdx); else updateCat(catIdx, { renaming: false }); }} className="text-[10px] text-[#a0acb8]">取消</button>
                </div>
              ) : (
                <div className="text-[12px] font-semibold text-[#3e4a57]">{cat.name}</div>
              )}
              {!cat.renaming && <div className="mt-0.5 text-[10px] text-[#8b97a3]">{cat.dimensions.length} 个二级维度</div>}
            </div>
            <div className={`relative ${readOnly ? "hidden" : ""}`} onClick={e => e.stopPropagation()}>
              <button onClick={() => setMenuOpenIdx(menuOpenIdx === catIdx ? null : catIdx)} className="text-[#84919e] hover:text-[#3e4c5a]">
                <MoreHorizontal className="size-4"/>
              </button>
              {menuOpenIdx === catIdx && (
                <div className="absolute right-0 top-6 z-20 w-[100px] rounded-md border border-[#dde5ee] bg-white shadow-lg">
                  <button onClick={() => { setCatNameDraft(cat.name); updateCat(catIdx, { renaming: true, expanded: true }); setMenuOpenIdx(null); }} className="flex w-full items-center px-3 py-2 text-left text-[11px] text-[#3e4c5a] hover:bg-[#f4f7fb]">重命名</button>
                  <button onClick={() => { deleteCat(catIdx); setMenuOpenIdx(null); }} className="flex w-full items-center px-3 py-2 text-left text-[11px] text-[#d75d5d] hover:bg-[#fff5f5]">删除门类</button>
                </div>
              )}
            </div>
          </div>

          {/* 展开内容：二级维度 + 新增入口 */}
          {cat.expanded && (
            <div className="border-t border-[#eef1f4] bg-white">
              {/* 适用标签：命中任一标签的客诉才套用本专用规则 */}
              {showTags && (
                <div className="border-b border-[#f2f4f7] px-5 py-3.5">
                  <div className="mb-2 text-[10px] text-[#8b97a3]">适用标签 <span className="text-[#b0bbc8]">（至少保留一个；命中任一标签的客诉才套用本专用规则）</span></div>
                  <div className={`flex flex-wrap items-center gap-1.5 rounded-lg border border-[#e4e9f0] px-2 py-2 ${readOnly ? "bg-[#fafbfc]" : "bg-white"}`}>
                    {(cat.tags ?? []).map(tag => (
                      <span key={tag} className="flex items-center gap-1 rounded-md bg-[#4b7ff0] py-1 pl-2.5 pr-1.5 text-[11px] font-medium text-white">
                        {tag}
                        {!readOnly && <button onClick={() => removeTag(catIdx, tag)} className="grid size-3.5 place-items-center rounded-full text-white/80 hover:bg-white/20"><X className="size-2.5"/></button>}
                      </span>
                    ))}
                    {(cat.tags ?? []).length === 0 && readOnly && <span className="px-1 text-[11px] text-[#b0bbc8]">未设置适用标签</span>}
                    {!readOnly && (
                      <input
                        value={tagDrafts[catIdx] ?? ""}
                        onChange={e => setTagDrafts(p => ({ ...p, [catIdx]: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(catIdx, tagDrafts[catIdx] ?? ""); } }}
                        onBlur={() => addTag(catIdx, tagDrafts[catIdx] ?? "")}
                        placeholder="输入标签后回车添加…"
                        className="h-6 min-w-[120px] flex-1 bg-transparent px-1 text-[11px] text-[#3e4a57] outline-none placeholder-[#b5bfc9]"
                      />
                    )}
                  </div>
                </div>
              )}
              {/* 门类级知识库：命中本门类标签的客诉，评分时加载以下知识作为参考 */}
              {showTags && (
                <div className="border-b border-[#f2f4f7] px-5 py-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[10px] text-[#8b97a3]">知识库 <span className="text-[#b0bbc8]">（本门类下所有评分维度共享，评分时作为参考资料加载）</span></div>
                    {!readOnly && (
                      <div className="relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setKbPickerIdx(kbPickerIdx === catIdx ? null : catIdx)}
                          className="flex h-6 items-center gap-1 rounded border border-[#d5e0f5] bg-[#eaf2ff] px-2 text-[10px] text-[#4b7ff0] hover:bg-[#daeaff]">
                          <Plus className="size-3"/>挂载知识
                        </button>
                        {kbPickerIdx === catIdx && (
                          <div className="absolute right-0 top-7 z-30 w-[260px] overflow-hidden rounded-lg border border-[#dde5ee] bg-white shadow-[0_12px_32px_rgba(41,53,66,.18)]">
                            <div className="border-b border-[#eef1f4] px-3 py-2 text-[10px] font-semibold text-[#374350]">选择知识条目</div>
                            <div className="max-h-[220px] overflow-auto py-1">
                              {(knowledge ?? []).length === 0 && <div className="px-3 py-4 text-center text-[10px] text-[#b0bbc8]">知识库为空，请先在「知识库」页新建</div>}
                              {(knowledge ?? []).map(k => {
                                const on = (cat.knowledgeIds ?? []).includes(k.id);
                                return (
                                  <button key={k.id} onClick={() => toggleKnowledge(catIdx, k.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#f4f7fb]">
                                    <span className={`grid size-3.5 shrink-0 place-items-center rounded border ${on ? "border-[#4b7ff0] bg-[#4b7ff0] text-white" : "border-[#c9d2dc] bg-white"}`}>{on && <Check className="size-2.5"/>}</span>
                                    <span className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-medium ${k.kind === "link" ? "bg-[#eef4ff] text-[#4b7ff0]" : "bg-[#eef7f1] text-[#27955d]"}`}>{k.kind === "link" ? "链接" : "文本"}</span>
                                    <span className="truncate text-[10px] text-[#465260]">{k.title}</span>
                                  </button>
                                );
                              })}
                            </div>
                            <div className="border-t border-[#eef1f4] bg-[#fafbfc] px-3 py-1.5 text-right">
                              <button onClick={() => setKbPickerIdx(null)} className="rounded bg-[#4b7ff0] px-2.5 py-1 text-[9px] font-medium text-white hover:bg-[#3d6fe0]">完成</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {(cat.knowledgeIds ?? []).length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#e4e9f0] px-3 py-2.5 text-[10px] text-[#b0bbc8]">{readOnly ? "未挂载知识库" : "尚未挂载知识库，点击右侧「挂载知识」引用"}</div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(cat.knowledgeIds ?? []).map(id => {
                        const k = (knowledge ?? []).find(x => x.id === id);
                        if (!k) return null;
                        return (
                          <span key={id} className="flex items-center gap-1.5 rounded-md bg-[#f2f6fc] py-1 pl-2 pr-1.5 text-[10px] text-[#3e4c5a] ring-1 ring-inset ring-[#e0e8f2]">
                            <span className={`rounded px-1 py-0.5 text-[8px] font-medium ${k.kind === "link" ? "bg-[#eef4ff] text-[#4b7ff0]" : "bg-[#eef7f1] text-[#27955d]"}`}>{k.kind === "link" ? "链接" : "文本"}</span>
                            {k.kind === "link"
                              ? <a href={k.content} target="_blank" rel="noreferrer" className="max-w-[160px] truncate font-medium text-[#4b7ff0] hover:underline" onClick={e => e.stopPropagation()}>{k.title}</a>
                              : <span className="max-w-[160px] truncate font-medium">{k.title}</span>}
                            {!readOnly && <button onClick={() => toggleKnowledge(catIdx, id)} className="grid size-3.5 place-items-center rounded-full text-[#8b97a3] hover:bg-[#dfe4ea]"><X className="size-2.5"/></button>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {/* 现有二级维度 */}
              {/* 按客服类型预览时，只留对该类型生效的规则——用来自查「这类客服的客诉，AI 到底加载了什么」 */}
              {cat.dimensions.map((dim, dimIdx) => {
                if (viewAs && !dimApplies(dim, viewAs)) return null;
                const key = `${catIdx}-${dimIdx}`;
                const detailType = detailTypeByKey[key] ?? (viewAs && dimApplies(dim, viewAs) ? viewAs : undefined);
                const draft = dimDrafts[key];
                const isEditing = editingKey?.cat === catIdx && editingKey?.dim === dimIdx;
                const isViewing = viewingKey?.cat === catIdx && viewingKey?.dim === dimIdx;
                return (
                  <div key={dimIdx} ref={el => { dimRowRefs.current[`${catIdx}-${dimIdx}`] = el; }} className={`border-b border-[#f2f4f7] px-5 transition ${isViewing ? "bg-[#eef5ff] ring-1 ring-inset ring-[#4b7ff0]" : ""}`}>
                    {/* 维度行 */}
                    <div className="grid grid-cols-[1.6fr_2.4fr_.5fr_.55fr] items-center gap-3 py-2.5 text-[11px]">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-[#465260]">{dim.title}</div>
                      </div>
                      <div className="truncate text-[10px] text-[#8797a5]">{dim.standard || "—"}</div>
                      <span className="rounded bg-[#fff0f0] px-1.5 py-0.5 text-center text-[10px] text-[#d75d5d]">{dim.score} 分</span>
                      <div className="flex justify-end gap-2">
                        {readOnly ? (
                          <button
                            onClick={() => { if (isViewing) { setViewingKey(null); } else { setViewingKey({ cat: catIdx, dim: dimIdx }); setEditingKey(null); } }}
                            className={`text-[10px] ${isViewing ? "text-[#4b7ff0]" : "text-[#778695] hover:text-[#4b7ff0]"}`}
                          >{isViewing ? "收起" : "查看"}</button>
                        ) : !isViewing && (
                          <>
                            <button
                              onClick={() => {
                                if (isEditing) { setEditingKey(null); } else {
                                  setDimDrafts(prev => ({ ...prev, [key]: cloneDim(dim) }));
                                  setEditingKey({ cat: catIdx, dim: dimIdx });
                                  setViewingKey(null);
                                  setAddingDim(null);
                                }
                              }}
                              className={`text-[10px] ${isEditing ? "text-[#4b7ff0]" : "text-[#778695] hover:text-[#4b7ff0]"}`}
                            >{isEditing ? "收起" : "修改"}</button>
                            <button onClick={() => deleteDim(catIdx, dimIdx)} className="text-[10px] text-[#b0bbc8] hover:text-[#d75d5d]">删除</button>
                          </>
                        )}
                      </div>
                    </div>
                    {/* 只读明细（从复审跳转进入） */}
                    {isViewing && !isEditing && (
                      <div className="mb-3 rounded-md border border-[#dfe7f4] bg-[#f8fbff] p-3">
                        <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-[10px]">
                          <span className="text-[#8794a0]">维度名称</span>
                          <span className="text-[#465260]">{dim.title}</span>
                          <span className="text-[#8794a0]">分值</span>
                          <span className="text-[#d75d5d]">{dim.score} 分</span>
                          <span className="text-[#8794a0]">说明</span>
                          <span className="leading-relaxed text-[#4d5966]">{dim.standard || "—"}</span>
                          <span className="text-[#8794a0]">生效客服类型</span>
                          <span className="flex flex-wrap gap-1">
                            {(dim.scopes && dim.scopes.length > 0 ? dim.scopes : agentTypes).map(t => {
                              const active = detailType === t;
                              return (
                                <button
                                  key={t}
                                  onClick={() => setDetailTypeByKey(prev => ({ ...prev, [key]: t }))}
                                  className={`rounded-full px-1.5 py-px text-[9px] transition ${active ? "bg-[#4b7ff0] font-medium text-white" : "bg-[#eaf2ff] text-[#3d6fe0] hover:bg-[#dceaff]"}`}
                                >
                                  {t}
                                </button>
                              );
                            })}
                          </span>
                          <span className="text-[#8794a0]">判断标准</span>
                          <span className="leading-relaxed text-[#4d5966]">{(detailType ? criteriaFor(dim, detailType) : dim.criteria) || "—"}</span>
                        </div>
                      </div>
                    )}
                    {/* 配置面板 */}
                    {isEditing && draft && (
                      <div className="mb-3 rounded-md border border-[#dfe7f4] bg-[#f8fbff] p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] font-medium text-[#496078]">编辑维度</span>
                          <div className="flex gap-2">
                            <button onClick={() => saveDim(catIdx, dimIdx, draft)} className="rounded bg-[#4b7ff0] px-2 py-0.5 text-[10px] text-white">保存</button>
                            <button onClick={() => setEditingKey(null)} className="text-[10px] text-[#8b97a3]">取消</button>
                          </div>
                        </div>
                        <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-[10px]">
                          <span className="pt-1 text-[#8794a0]">维度名称</span>
                          <input value={draft.title} onChange={e => setDimDrafts(p => ({ ...p, [key]: { ...p[key], title: e.target.value } }))} className="h-6 rounded border border-[#dbe3ee] bg-white px-2 text-[10px] outline-none focus:border-[#4b7ff0]"/>
                          <span className="pt-1 text-[#8794a0]">说明</span>
                          <textarea value={draft.standard} onChange={e => setDimDrafts(p => ({ ...p, [key]: { ...p[key], standard: e.target.value } }))} rows={2} className="resize-none rounded border border-[#dbe3ee] bg-white px-2 py-1 text-[10px] leading-4 outline-none focus:border-[#4b7ff0]"/>
                          <DimScopeEditor draft={draft} patch={pt => setDimDrafts(p => ({ ...p, [key]: { ...p[key], ...pt } }))}
                            scoreControl={<input value={draft.score} onChange={e => setDimDrafts(p => ({ ...p, [key]: { ...p[key], score: e.target.value } }))} className="h-6 w-full rounded border border-[#dbe3ee] bg-white px-2 text-[10px] outline-none focus:border-[#4b7ff0]"/>}
                            agentTypes={agentTypes} viewAs={viewAs}/>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 新增二级维度入口 / 表单 */}
              {addingDim === catIdx ? (
                <div className="m-3 rounded-md border border-[#dfe7f4] bg-[#f8fbff] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#496078]">新增二级维度</span>
                    <div className="flex gap-2">
                      <button onClick={() => saveNewDim(catIdx)} disabled={!newDimDraft.title.trim()} className="rounded bg-[#4b7ff0] px-2 py-0.5 text-[10px] text-white disabled:opacity-40">保存</button>
                      <button onClick={() => { setAddingDim(null); setNewDimDraft(emptyDraft); }} className="text-[10px] text-[#8b97a3]">取消</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-[10px]">
                    <span className="pt-1 text-[#8794a0]">维度名称 <span className="text-[#e59735]">*</span></span>
                    <input autoFocus value={newDimDraft.title} onChange={e => setNewDimDraft(p => ({ ...p, title: e.target.value }))} placeholder="例：敷衍用户" className="h-6 rounded border border-[#dbe3ee] bg-white px-2 text-[10px] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
                    <span className="pt-1 text-[#8794a0]">说明</span>
                    <textarea value={newDimDraft.standard} onChange={e => setNewDimDraft(p => ({ ...p, standard: e.target.value }))} rows={2} placeholder="简述该维度的质检说明…" className="resize-none rounded border border-[#dbe3ee] bg-white px-2 py-1 text-[10px] leading-4 outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
                    <DimScopeEditor draft={newDimDraft} patch={pt => setNewDimDraft(p => ({ ...p, ...pt }))}
                      scoreControl={<input value={newDimDraft.score} onChange={e => setNewDimDraft(p => ({ ...p, score: e.target.value }))} placeholder="-2" className="h-6 w-full rounded border border-[#dbe3ee] bg-white px-2 text-[10px] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>}
                      agentTypes={agentTypes} viewAs={viewAs}/>
                  </div>
                </div>
              ) : !readOnly && (
                <button
                  onClick={e => { e.stopPropagation(); setAddingDim(catIdx); setEditingKey(null); setNewDimDraft(emptyDraft); }}
                  className="flex w-full items-center gap-1.5 border-t border-dashed border-[#edf0f4] py-2.5 pl-10 pr-5 text-left text-[11px] text-[#8797a5] hover:bg-[#f6f9ff] hover:text-[#4b7ff0]"
                >
                  <Plus className="size-3.5"/>新增二级{label.includes("通用") ? "通用" : "专用"}维度
                </button>
              )}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}

function PrincipleScopePicker({ scopes, agentTypes, onChange }: {
  scopes?: AgentType[];
  agentTypes: AgentType[];
  onChange: (scopes: AgentType[] | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = scopes && scopes.length > 0 ? scopes : agentTypes;
  const allOn = selected.length >= agentTypes.length;

  function toggle(t: AgentType) {
    const next = selected.includes(t) ? selected.filter(x => x !== t) : [...agentTypes.filter(x => selected.includes(x) || x === t)];
    if (next.length === 0) return;
    onChange(next.length >= agentTypes.length ? undefined : next);
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex h-7 w-full items-center justify-between rounded border border-[#dbe3ee] bg-white px-2 text-left text-[10px] text-[#3e4c5a] outline-none hover:border-[#c3d0e0] focus:border-[#4b7ff0]">
        <span className="truncate">{allOn ? "全部客服" : selected.length === 1 ? selected[0] : `已选择 ${selected.length} 类客服`}</span>
        <ChevronRight className={`ml-2 size-3 shrink-0 text-[#8b97a3] transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-8 z-30 overflow-hidden rounded-md border border-[#dde5ee] bg-white shadow-[0_8px_24px_rgba(41,53,66,.16)]">
          <div className="flex items-center justify-between border-b border-[#eef1f4] bg-[#fafbfc] px-2.5 py-1.5">
            <span className="text-[9px] text-[#8794a0]">可多选</span>
            <button type="button" onClick={() => onChange(undefined)} className="text-[9px] text-[#4b7ff0] hover:underline">全选</button>
          </div>
          <div className="max-h-[180px] overflow-auto py-1">
            {agentTypes.map(t => {
              const on = selected.includes(t);
              const only = on && selected.length === 1;
              return (
                <button key={t} type="button" onClick={() => toggle(t)} disabled={only}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] transition ${only ? "cursor-not-allowed opacity-60" : "hover:bg-[#f4f7fb]"}`}>
                  <span className={`grid size-3.5 place-items-center rounded-sm border ${on ? "border-[#4b7ff0] bg-[#4b7ff0] text-white" : "border-[#cdd6e0] bg-white"}`}>{on && <Check className="size-2.5" />}</span>
                  <span className={on ? "font-medium text-[#3d6fe0]" : "text-[#465260]"}>{t}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
function PrinciplesList({ principles, setPrinciples, readOnly, agentTypes, viewAs }: {
  principles: Principle[];
  setPrinciples: React.Dispatch<React.SetStateAction<Principle[]>>;
  readOnly?: boolean;
  agentTypes: AgentType[];
  viewAs?: AgentType | null;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<Principle>({ title: "", content: "" });
  const [adding, setAdding] = useState(false);

  function startEdit(idx: number) {
    setDraft({ ...principles[idx] });
    setEditingIdx(idx);
    setAdding(false);
  }
  function saveEdit(idx: number) {
    if (!draft.title.trim() || !draft.content.trim()) return;
    setPrinciples(prev => prev.map((p, i) => i === idx ? { title: draft.title.trim(), content: draft.content.trim(), scopes: draft.scopes } : p));
    setEditingIdx(null);
  }
  function saveNew() {
    if (!draft.title.trim() || !draft.content.trim()) return;
    setPrinciples(prev => [...prev, { title: draft.title.trim(), content: draft.content.trim(), scopes: draft.scopes }]);
    setAdding(false);
    setDraft({ title: "", content: "" });
  }
  function remove(idx: number) {
    setPrinciples(prev => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  }

  const visibleCount = viewAs ? principles.filter(p => principleApplies(p, viewAs)).length : principles.length;

  return (
    <div className="rounded-lg border border-[#e1e5e9] bg-white">
      <div className="flex items-center justify-between border-b border-[#e8ecf0] px-4 py-3">
        <div>
          <div className="text-[12px] font-semibold text-[#35414e]">评分原则</div>
          <div className="mt-0.5 text-[10px] text-[#909ba6]">告诉 AI 应当如何评分的总体原则，不设分值，作为所有规则打分前的共同准则</div>
        </div>
        <button
          onClick={() => { setAdding(true); setEditingIdx(null); setDraft({ title: "", content: "" }); }}
          className={`flex h-7 items-center gap-1 rounded border border-[#d5e0f5] bg-[#eaf2ff] px-2.5 text-[11px] text-[#4b7ff0] hover:bg-[#daeaff] ${readOnly ? "hidden" : ""}`}
        >
          <Plus className="size-3.5"/>添加原则
        </button>
      </div>

      <div className="border-b border-[#eef3fa] bg-[#f8fbff] px-4 py-2.5 text-[10px] leading-relaxed text-[#7a8794]">
        这些原则会作为 AI 质检的「打分总则」，在应用每条具体规则之前统一遵循。请用清晰、可执行的自然语言描述，例如「默认满分，见问题才扣」。
      </div>

      {visibleCount === 0 && !adding && (
        <div className="px-4 py-8 text-center text-[11px] text-[#b0bbc8]">{viewAs ? `暂无适配「${viewAs}」的评分原则` : "暂无评分原则，点击右上角「添加原则」新建"}</div>
      )}

      {principles.map((p, idx) => {
        if (viewAs && !principleApplies(p, viewAs)) return null;
        const isEditing = editingIdx === idx;
        return (
          <div key={idx} className="border-b border-[#eef1f4] px-5 py-3 last:border-b-0">
            {isEditing ? (
              <div className="rounded-md border border-[#dfe7f4] bg-[#f8fbff] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#496078]">编辑原则</span>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(idx)} disabled={!draft.title.trim() || !draft.content.trim()} className="rounded bg-[#4b7ff0] px-2 py-0.5 text-[10px] text-white disabled:opacity-40">保存</button>
                    <button onClick={() => setEditingIdx(null)} className="text-[10px] text-[#8b97a3]">取消</button>
                  </div>
                </div>
                <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-[10px]">
                  <span className="pt-1 text-[#8794a0]">原则名称</span>
                  <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} className="h-6 rounded border border-[#dbe3ee] bg-white px-2 text-[10px] outline-none focus:border-[#4b7ff0]"/>
                  <span className="pt-1 text-[#8794a0]">适配客服类型</span>
                  <PrincipleScopePicker scopes={draft.scopes} agentTypes={agentTypes} onChange={scopes => setDraft(d => ({ ...d, scopes }))}/>
                  <span className="pt-1 text-[#8794a0]">原则说明</span>
                  <textarea value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} rows={3} className="resize-none rounded border border-[#dbe3ee] bg-white px-2 py-1 text-[10px] leading-4 outline-none focus:border-[#4b7ff0]"/>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#eef4ff] text-[10px] font-semibold text-[#4b7ff0]">{idx + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-[#465260]">{p.title}</div>
                  <div className="mt-0.5 text-[10px] leading-relaxed text-[#7a8794]">{p.content}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {!readOnly && <button onClick={() => startEdit(idx)} className="text-[10px] text-[#778695] hover:text-[#4b7ff0]">修改</button>}
                  {!readOnly && <button onClick={() => remove(idx)} className="text-[10px] text-[#b0bbc8] hover:text-[#d75d5d]">删除</button>}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {adding && (
        <div className="m-3 rounded-md border border-[#dfe7f4] bg-[#f8fbff] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-[#496078]">新增评分原则</span>
            <div className="flex gap-2">
              <button onClick={saveNew} disabled={!draft.title.trim() || !draft.content.trim()} className="rounded bg-[#4b7ff0] px-2 py-0.5 text-[10px] text-white disabled:opacity-40">保存</button>
              <button onClick={() => { setAdding(false); setDraft({ title: "", content: "" }); }} className="text-[10px] text-[#8b97a3]">取消</button>
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-[10px]">
            <span className="pt-1 text-[#8794a0]">原则名称 <span className="text-[#e59735]">*</span></span>
            <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="如：默认满分，见问题才扣" className="h-6 rounded border border-[#dbe3ee] bg-white px-2 text-[10px] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
            <span className="pt-1 text-[#8794a0]">适配客服类型</span>
            <PrincipleScopePicker scopes={draft.scopes} agentTypes={agentTypes} onChange={scopes => setDraft(d => ({ ...d, scopes }))}/>
            <span className="pt-1 text-[#8794a0]">原则说明 <span className="text-[#e59735]">*</span></span>
            <textarea value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} rows={3} placeholder="用清晰、可执行的自然语言描述该原则…" className="resize-none rounded border border-[#dbe3ee] bg-white px-2 py-1 text-[10px] leading-4 outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
          </div>
        </div>
      )}
    </div>
  );
}

function KnowledgeLibrary({ knowledge, onAdd, onUpdate, onDelete, readOnly }: { knowledge: KnowledgeItem[]; onAdd: (item: Omit<KnowledgeItem, "id">) => void; onUpdate: (id: string, patch: Partial<Omit<KnowledgeItem, "id">>) => void; onDelete: (id: string) => void; readOnly?: boolean }) {
  const empty: Omit<KnowledgeItem, "id"> = { title: "", kind: "text", content: "" };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<KnowledgeItem, "id">>(empty);
  const [adding, setAdding] = useState(false);

  function startAdd() { setDraft(empty); setAdding(true); setEditingId(null); }
  function startEdit(k: KnowledgeItem) { setDraft({ title: k.title, kind: k.kind, content: k.content }); setEditingId(k.id); setAdding(false); }
  function saveAdd() { if (!draft.title.trim() || !draft.content.trim()) return; onAdd({ title: draft.title.trim(), kind: draft.kind, content: draft.content.trim() }); setAdding(false); setDraft(empty); }
  function saveEdit(id: string) { if (!draft.title.trim() || !draft.content.trim()) return; onUpdate(id, { title: draft.title.trim(), kind: draft.kind, content: draft.content.trim() }); setEditingId(null); }

  const Form = ({ onSave, onCancel, isNew }: { onSave: () => void; onCancel: () => void; isNew: boolean }) => (
    <div className="rounded-md border border-[#dfe7f4] bg-[#f8fbff] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium text-[#496078]">{isNew ? "新增知识条目" : "编辑知识条目"}</span>
        <div className="flex gap-2">
          <button onClick={onSave} disabled={!draft.title.trim() || !draft.content.trim()} className="rounded bg-[#4b7ff0] px-2 py-0.5 text-[10px] text-white disabled:opacity-40">保存</button>
          <button onClick={onCancel} className="text-[10px] text-[#8b97a3]">取消</button>
        </div>
      </div>
      <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-[10px]">
        <span className="pt-1 text-[#8794a0]">标题 <span className="text-[#e59735]">*</span></span>
        <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="如：精准答疑标准话术" className="h-6 rounded border border-[#dbe3ee] bg-white px-2 text-[10px] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
        <span className="pt-1 text-[#8794a0]">类型</span>
        <div className="flex gap-1.5">
          {(["text", "link"] as const).map(k => (
            <button key={k} onClick={() => setDraft(d => ({ ...d, kind: k }))} className={`rounded px-2.5 py-1 text-[10px] font-medium transition ${draft.kind === k ? "bg-[#4b7ff0] text-white" : "bg-white text-[#6b7a89] ring-1 ring-inset ring-[#dbe3ee] hover:bg-[#f2f5f9]"}`}>{k === "text" ? "文本" : "链接"}</button>
          ))}
        </div>
        <span className="pt-1 text-[#8794a0]">{draft.kind === "text" ? "内容" : "链接"} <span className="text-[#e59735]">*</span></span>
        {draft.kind === "text"
          ? <textarea value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} rows={3} placeholder="填写知识内容，供质检评分参考…" className="resize-none rounded border border-[#dbe3ee] bg-white px-2 py-1 text-[10px] leading-4 outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
          : <input value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} placeholder="https://…" className="h-6 rounded border border-[#dbe3ee] bg-white px-2 text-[10px] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>}
      </div>
    </div>
  );

  return (
    <div className="rounded-lg border border-[#e1e5e9] bg-white">
      <div className="flex items-center justify-between border-b border-[#e8ecf0] px-4 py-3">
        <div>
          <div className="text-[12px] font-semibold text-[#35414e]">知识库</div>
          <div className="mt-0.5 text-[10px] text-[#909ba6]">沉淀口径、话术、FAQ 与外部文档，供专用规则的评分维度引用</div>
        </div>
        {!readOnly && (
          <button onClick={startAdd} className="flex h-7 items-center gap-1 rounded border border-[#d5e0f5] bg-[#eaf2ff] px-2.5 text-[11px] text-[#4b7ff0] hover:bg-[#daeaff]">
            <Plus className="size-3.5"/>添加
          </button>
        )}
      </div>

      {knowledge.length === 0 && !adding && (
        <div className="px-4 py-8 text-center text-[11px] text-[#b0bbc8]">暂无知识条目，点击右上角「添加」新建</div>
      )}

      {knowledge.map(k => (
        <div key={k.id} className="border-b border-[#eef1f4] px-4 py-3 last:border-b-0">
          {editingId === k.id ? (
            <Form isNew={false} onSave={() => saveEdit(k.id)} onCancel={() => setEditingId(null)} />
          ) : (
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${k.kind === "link" ? "bg-[#eef4ff] text-[#4b7ff0]" : "bg-[#eef7f1] text-[#27955d]"}`}>{k.kind === "link" ? "链接" : "文本"}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-[#465260]">{k.title}</div>
                {k.kind === "link"
                  ? <a href={k.content} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-[10px] text-[#4b7ff0] hover:underline">{k.content}</a>
                  : <div className="mt-0.5 text-[10px] leading-relaxed text-[#7a8794]">{k.content}</div>}
              </div>
              {!readOnly && (
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => startEdit(k)} className="text-[10px] text-[#778695] hover:text-[#4b7ff0]">修改</button>
                  <button onClick={() => onDelete(k.id)} className="text-[10px] text-[#b0bbc8] hover:text-[#d75d5d]">删除</button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {adding && <div className="p-3"><Form isNew onSave={saveAdd} onCancel={() => { setAdding(false); setDraft(empty); }} /></div>}
    </div>
  );
}

// —— 客服类型清单 ——
// 类型名是规则 scopes / variants 的键，改名与删除都会连带迁移规则（见 App 里的 renameAgentType / deleteAgentType）。
// 界面上把「被 N 条规则引用」直接摆在名字旁边，让用户在动手改名或删除之前就知道影响面有多大。
function AgentTypeList({ types, refCount, onAdd, onRename, onDelete, readOnly }: {
  types: AgentType[]; refCount: (name: string) => number;
  onAdd: (name: string) => void; onRename: (oldName: string, name: string) => void; onDelete: (name: string) => void;
  readOnly?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const dupNew = newName.trim() !== "" && types.includes(newName.trim());
  const dupEdit = editName.trim() !== "" && editName.trim() !== editing && types.includes(editName.trim());

  return (
    <div className="rounded-lg border border-[#e1e5e9] bg-white">
      <div className="flex items-center justify-between border-b border-[#e8ecf0] px-4 py-3">
        <div>
          <div className="text-[12px] font-semibold text-[#35414e]">客服类型</div>
          <div className="mt-0.5 text-[10px] text-[#909ba6]">规则的「生效客服类型」从这份清单取值；同一条规则可对多类生效，并按类型分别设判断标准</div>
        </div>
        {!readOnly && (
          <button onClick={() => { setNewName(""); setAdding(true); }} className="flex h-7 items-center gap-1 rounded border border-[#d5e0f5] bg-[#eaf2ff] px-2.5 text-[11px] text-[#4b7ff0] hover:bg-[#daeaff]">
            <Plus className="size-3.5"/>添加类型
          </button>
        )}
      </div>

      {types.map(t => {
        const n = refCount(t);
        const isEditing = editing === t;
        return (
          <div key={t} className="border-b border-[#eef1f4] px-4 py-2.5 last:border-b-0">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !dupEdit) { onRename(t, editName); setEditing(null); } if (e.key === "Escape") setEditing(null); }}
                  className="h-6 w-[160px] rounded border border-[#dbe3ee] bg-white px-2 text-[11px] outline-none focus:border-[#4b7ff0]"/>
                <button onClick={() => { onRename(t, editName); setEditing(null); }} disabled={!editName.trim() || dupEdit}
                  className="rounded bg-[#4b7ff0] px-2 py-0.5 text-[10px] text-white disabled:opacity-40">保存</button>
                <button onClick={() => setEditing(null)} className="text-[10px] text-[#8b97a3]">取消</button>
                {dupEdit && <span className="text-[10px] text-[#c54f4f]">该类型已存在</span>}
                {!dupEdit && n > 0 && <span className="text-[10px] text-[#8794a0]">改名后 {n} 条规则中的这一类型会同步更新</span>}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-medium text-[#465260]">{t}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${n > 0 ? "bg-[#eef4ff] text-[#4b7ff0]" : "bg-[#f4f6f8] text-[#a3adba]"}`}>被 {n} 条规则引用</span>
                {!readOnly && (
                  <div className="ml-auto flex shrink-0 gap-2">
                    <button onClick={() => { setEditName(t); setEditing(t); setConfirming(null); }} className="text-[10px] text-[#778695] hover:text-[#4b7ff0]">改名</button>
                    <button onClick={() => setConfirming(confirming === t ? null : t)} disabled={types.length <= 1}
                      title={types.length <= 1 ? "至少保留一个客服类型" : undefined}
                      className="text-[10px] text-[#b0bbc8] hover:text-[#d75d5d] disabled:cursor-not-allowed disabled:opacity-50">删除</button>
                  </div>
                )}
              </div>
            )}
            {/* 删除确认：先把后果讲明白——只对这一类生效的规则会回落成「全部客服」，它的差异标准也会一起丢。 */}
            {confirming === t && !isEditing && (
              <div className="mt-2 rounded border border-[#f0d6d6] bg-[#fff7f7] px-3 py-2 text-[10px] leading-relaxed text-[#a24b4b]">
                删除「{t}」后：{n > 0 ? `${n} 条点名引用它的规则会移除该类型（若移除后不剩任何类型，则回落为对全部客服生效），为它单独设的判断标准也会一并删除。` : "当前没有规则点名引用它，删除不影响现有规则。"}
                <div className="mt-1.5 flex gap-2">
                  <button onClick={() => { onDelete(t); setConfirming(null); }} className="rounded bg-[#d75d5d] px-2 py-0.5 text-[10px] font-medium text-white hover:bg-[#c54f4f]">确认删除</button>
                  <button onClick={() => setConfirming(null)} className="text-[10px] text-[#8b97a3]">取消</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {adding && (
        <div className="flex items-center gap-2 border-t border-[#eef1f4] px-4 py-2.5">
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="例：夜间值班客服"
            onKeyDown={e => { if (e.key === "Enter" && newName.trim() && !dupNew) { onAdd(newName); setAdding(false); setNewName(""); } if (e.key === "Escape") setAdding(false); }}
            className="h-6 w-[160px] rounded border border-[#dbe3ee] bg-white px-2 text-[11px] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
          <button onClick={() => { onAdd(newName); setAdding(false); setNewName(""); }} disabled={!newName.trim() || dupNew}
            className="rounded bg-[#4b7ff0] px-2 py-0.5 text-[10px] text-white disabled:opacity-40">保存</button>
          <button onClick={() => { setAdding(false); setNewName(""); }} className="text-[10px] text-[#8b97a3]">取消</button>
          {dupNew ? <span className="text-[10px] text-[#c54f4f]">该类型已存在</span>
            : <span className="text-[10px] text-[#a3adba]">新类型会自动纳入「对全部客服生效」的规则；已收窄范围的规则需手动勾选</span>}
        </div>
      )}
    </div>
  );
}

function RulesPage({ commonCats, setCommonCats, privateCats, setPrivateCats, principles, setPrinciples, knowledge, onAddKnowledge, onUpdateKnowledge, onDeleteKnowledge, agentTypes, onAddAgentType, onRenameAgentType, onDeleteAgentType, agentTypeRefCount, targetRuleName, targetEditable, onTargetConsumed, onRulesModified, showBack, onBack, readOnly, versions, latestVersion, totalSeq, isDirty, viewingVersionId, setViewingVersionId, onSaveVersion, onDiscardChanges, onRestoreVersion }: {
  commonCats: Cat[]; setCommonCats: React.Dispatch<React.SetStateAction<Cat[]>>;
  privateCats: Cat[]; setPrivateCats: React.Dispatch<React.SetStateAction<Cat[]>>;
  principles: Principle[]; setPrinciples: React.Dispatch<React.SetStateAction<Principle[]>>;
  knowledge: KnowledgeItem[]; onAddKnowledge: (item: Omit<KnowledgeItem, "id">) => void; onUpdateKnowledge: (id: string, patch: Partial<Omit<KnowledgeItem, "id">>) => void; onDeleteKnowledge: (id: string) => void;
  agentTypes: AgentType[]; onAddAgentType: (name: string) => void; onRenameAgentType: (oldName: string, name: string) => void; onDeleteAgentType: (name: string) => void; agentTypeRefCount: (name: string) => number;
  targetRuleName: string | null; targetEditable: boolean; onTargetConsumed: () => void;
  onRulesModified: () => void;
  showBack?: boolean;
  onBack?: () => void;
  readOnly?: boolean;
  versions: RuleVersion[]; latestVersion: RuleVersion; totalSeq: number; isDirty: boolean;
  viewingVersionId: string | null; setViewingVersionId: (id: string | null) => void;
  onSaveVersion: (note: string) => void; onDiscardChanges: () => void; onRestoreVersion: (id: string) => void;
}) {
  const inCommon = targetRuleName ? commonCats.some(c => c.dimensions.some(d => d.title === targetRuleName)) : false;
  const inPrivate = targetRuleName ? privateCats.some(c => c.dimensions.some(d => d.title === targetRuleName)) : false;
  const [tab, setTab] = useState<"common" | "private" | "principle">("common");
  const [historyOpen, setHistoryOpen] = useState(false);
  // 「按客服类型查看」：选中某一类后，通用/专用列表只留对它生效的规则，判断标准也换成该类实际加载的那份，
  // 用来自查「这类客服的客诉，AI 到底会加载哪些规则」。null＝不过滤，看全量配置。
  const [viewAs, setViewAs] = useState<AgentType | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveNote, setSaveNote] = useState("");

  React.useEffect(() => {
    if (targetRuleName) {
      if (inCommon) setTab("common");
      else if (inPrivate) setTab("private");
    }
  }, [targetRuleName]);

  // 正在查看的历史版本（若有）——预览时用它的内容并强制只读。
  const previewVersion = viewingVersionId ? versions.find(v => v.id === viewingVersionId) ?? null : null;
  const isPreview = !!previewVersion;
  const canEdit = !readOnly && !isPreview;
  // 预览用本地副本：内容只读，但需要可展开/收起门类，故给一份可变的 UI 副本。
  const [previewCommon, setPreviewCommon] = useState<Cat[]>([]);
  const [previewPrivate, setPreviewPrivate] = useState<Cat[]>([]);
  React.useEffect(() => {
    if (previewVersion) {
      setPreviewCommon(previewVersion.commonCats.map(hydrateCat));
      setPreviewPrivate(previewVersion.privateCats.map(hydrateCat));
    }
  }, [viewingVersionId]);
  const shownCommon = isPreview ? previewCommon : commonCats;
  const shownPrivate = isPreview ? previewPrivate : privateCats;
  const shownPrinciples = previewVersion ? previewVersion.principles : principles;

  function confirmSave() {
    onSaveVersion(saveNote);
    setSaveNote("");
    setSaveOpen(false);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5">
        <div>
          <h1 className="flex items-center gap-2 text-[15px] font-semibold text-[#2f3b48]">
            质检规则管理
            {readOnly && <span className="rounded-full bg-[#f0f2f5] px-2 py-0.5 text-[10px] font-medium text-[#98a3af]">只读</span>}
          </h1>
          <p className="mt-0.5 text-[10px] text-[#8b96a3]">{readOnly ? "仅业务管理者/超级管理者可修改规则，你可查看全部内容" : "配置规则门类、评分维度与扣分标准"}</p>
        </div>
        <div className="flex items-center gap-2">
          {(tab === "common" || tab === "private" || tab === "principle") && (
            <select
              aria-label="规则视角"
              title="切换客服类型视角"
              value={viewAs ?? ""}
              onChange={e => setViewAs(e.target.value === "" ? null : e.target.value)}
              className="h-7 max-w-[120px] rounded border border-[#dbe3ee] bg-[#fafbfd] px-2 text-[11px] text-[#3e4c5a] outline-none hover:border-[#c3d0e0] focus:border-[#4b7ff0] focus:bg-white"
            >
              <option value="">全部</option>
              {agentTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {/* 历史版本入口 */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setHistoryOpen(o => !o)} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#5b6b7b] hover:bg-[#f2f6fb]">
              <History className="size-3.5" />
              {isPreview ? `查看中：${previewVersion!.id}` : `当前 ${latestVersion.id}`}
              {isDirty && !isPreview && <span className="ml-0.5 rounded-full bg-[#fdeede] px-1.5 py-0.5 text-[9px] font-medium text-[#c9821f]">未保存</span>}
            </button>
            {historyOpen && (
              <div className="absolute right-0 top-9 z-30 w-[300px] overflow-hidden rounded-lg border border-[#dde5ee] bg-white shadow-[0_12px_32px_rgba(41,53,66,.18)]">
                <div className="border-b border-[#eef1f4] px-3 py-2 text-[11px] font-semibold text-[#374350]">历史版本</div>
                <div className="max-h-[280px] overflow-auto">
                  {isDirty && (
                    <div className="flex items-center gap-2 border-b border-[#f2f4f7] bg-[#fffaf1] px-3 py-2">
                      <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-[#e59735]" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-medium text-[#b9791d]">当前有未保存的修改</div>
                        <div className="mt-0.5 text-[9px] text-[#c9a566]">保存后将生成新版本</div>
                      </div>
                    </div>
                  )}
                  {versions.map(v => {
                    const active = isPreview ? v.id === viewingVersionId : v.id === latestVersion.id && !isDirty;
                    return (
                      <button key={v.id} onClick={() => { if (v.id === latestVersion.id) setViewingVersionId(null); else setViewingVersionId(v.id); setHistoryOpen(false); }}
                        className={`flex w-full items-start gap-2 border-b border-[#f2f4f7] px-3 py-2.5 text-left last:border-b-0 hover:bg-[#f4f7fb] ${active ? "bg-[#eef5ff]" : ""}`}>
                        <div className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ${active ? "bg-[#4b7ff0] text-white" : "bg-[#eef1f4] text-transparent"}`}><Check className="size-2.5" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-[#3e4c5a]">{v.id}</span>
                            {v.id === latestVersion.id && <span className="rounded-full bg-[#eaf6ef] px-1.5 py-0.5 text-[9px] font-medium text-[#27955d]">最新</span>}
                          </div>
                          <div className="mt-0.5 truncate text-[10px] text-[#5b6b7b]" title={v.note}>{v.note}</div>
                          <div className="mt-0.5 flex items-center gap-1 text-[9px] text-[#98a3af]"><Clock className="size-2.5" />{v.savedAt} · {v.author}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {totalSeq - versions.length > 0 && (
                  <div className="border-t border-[#eef1f4] bg-[#fafbfc] px-3 py-2 text-[9px] leading-relaxed text-[#a8b2be]">
                    已累计提交 {totalSeq} 个版本，仅保留最近 {MAX_VERSIONS} 个；更早的 {totalSeq - versions.length} 个版本（v1 ~ v{totalSeq - versions.length}）已自动清理。
                  </div>
                )}
              </div>
            )}
          </div>
          {/* 保存入口统一收敛到下方「未保存修改」提示条，避免重复 */}
          {showBack && onBack && (
            <button onClick={onBack} className="flex items-center gap-1 rounded-md border border-[#4b7ff0] bg-[#eaf2ff] px-2.5 py-1.5 text-[10px] font-medium text-[#3562c8] hover:bg-[#dceeff]">
              <ChevronRight className="size-3 rotate-180" />返回复核结果
            </button>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-5" onClick={() => setHistoryOpen(false)}>
        {/* 预览历史版本提示条 */}
        {isPreview && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#d5e0f5] bg-[#eef5ff] px-4 py-2.5 text-[11px] text-[#3562c8]">
            <History className="size-4 shrink-0" />
            <span className="flex-1">正在查看历史版本 <b>{previewVersion!.id}</b>（{previewVersion!.note}），仅供浏览，不影响当前生效的规则。</span>
            {!readOnly && (
              <button onClick={() => onRestoreVersion(previewVersion!.id)} className="flex items-center gap-1 rounded-md bg-[#4b7ff0] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[#3d6fe0]">
                <RotateCcw className="size-3" />回滚到此版本
              </button>
            )}
            <button onClick={() => setViewingVersionId(null)} className="rounded-md border border-[#c9d8ee] bg-white px-2.5 py-1 text-[10px] text-[#3562c8] hover:bg-[#f2f6fb]">退出查看</button>
          </div>
        )}
        {/* 未保存修改提示条 */}
        {canEdit && isDirty && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#f0dcb8] bg-[#fffaf1] px-4 py-2.5 text-[11px] text-[#b9791d]">
            <span className="size-1.5 shrink-0 rounded-full bg-[#e59735]" />
            <span className="flex-1">规则已修改但尚未保存为版本。</span>
            <button onClick={() => { setSaveNote(""); setSaveOpen(true); }} className="rounded-md bg-[#4b7ff0] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[#3d6fe0]">保存为新版本</button>
            <button onClick={onDiscardChanges} className="rounded-md border border-[#e6d3ad] bg-white px-2.5 py-1 text-[10px] text-[#b9791d] hover:bg-[#fff4e2]">放弃修改</button>
          </div>
        )}
        <div className="mb-3 flex w-fit rounded-md border border-[#dfe5ea] bg-white p-0.5">
          <button onClick={() => setTab("principle")} className={`rounded px-3 py-1.5 text-[11px] transition ${tab === "principle" ? "bg-[#eaf2ff] font-medium text-[#3e72df]" : "text-[#778594]"}`}>评分原则</button>
          <button onClick={() => setTab("common")} className={`rounded px-3 py-1.5 text-[11px] transition ${tab === "common" ? "bg-[#eaf2ff] font-medium text-[#3e72df]" : "text-[#778594]"}`}>通用质检规则列表</button>
          <button onClick={() => setTab("private")} className={`rounded px-3 py-1.5 text-[11px] transition ${tab === "private" ? "bg-[#eaf2ff] font-medium text-[#3e72df]" : "text-[#778594]"}`}>专用质检规则列表</button>
        </div>
        {/* 规则视角已移至右上角，避免占用内容区域。 */}
        {tab === "common" ? (
          <RulesList label="通用规则" sublabel="适用于全部客服会话的基础质检要求" cats={shownCommon} setCats={isPreview ? setPreviewCommon : setCommonCats} targetRuleName={tab === "common" && !isPreview ? targetRuleName : null} targetEditable={targetEditable} onTargetConsumed={onTargetConsumed} onRulesModified={onRulesModified} readOnly={!canEdit} agentTypes={agentTypes} viewAs={viewAs}/>
        ) : tab === "private" ? (
          <RulesList label="专用规则" sublabel="仅对指定业务线、活动或场景生效" showTags knowledge={knowledge} cats={shownPrivate} setCats={isPreview ? setPreviewPrivate : setPrivateCats} targetRuleName={tab === "private" && !isPreview ? targetRuleName : null} targetEditable={targetEditable} onTargetConsumed={onTargetConsumed} onRulesModified={onRulesModified} readOnly={!canEdit} agentTypes={agentTypes} viewAs={viewAs}/>
        ) : (
          <PrinciplesList principles={shownPrinciples} setPrinciples={setPrinciples} readOnly={!canEdit} agentTypes={agentTypes} viewAs={viewAs}/>
        )}
      </div>

      {/* 保存新版本弹窗 */}
      {saveOpen && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-6" onClick={() => setSaveOpen(false)}>
          <div className="w-full max-w-[380px] rounded-xl bg-white p-5 shadow-[0_20px_50px_rgba(41,53,66,.28)]" onClick={e => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-[#2f3b48]"><Check className="size-4 text-[#4b7ff0]" />保存为新版本</div>
            <p className="mb-3 text-[10px] leading-relaxed text-[#8b96a3]">当前修改将保存为 <b className="text-[#4b7ff0]">v{latestVersion.seq + 1}</b>，历史版本仍可随时查看或恢复。</p>
            <label className="mb-1 block text-[10px] text-[#8b97a3]">版本说明<span className="ml-1 text-[#a8b2be]">（选填，便于日后识别）</span></label>
            <textarea autoFocus value={saveNote} onChange={e => setSaveNote(e.target.value)} rows={3}
              placeholder="例：上调「精准答疑」扣分至 -5，新增「敷衍用户」维度"
              className="w-full resize-none rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-[11px] leading-relaxed text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSaveOpen(false)} className="rounded-md border border-[#d9e2ee] bg-white px-3 py-1.5 text-[11px] text-[#6b7a89] hover:bg-[#f2f5f9]">取消</button>
              <button onClick={confirmSave} className="rounded-md bg-[#4b7ff0] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#3d6fe0]">确认保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type AgentRecord = {
  id: string;
  complaintId: string;
  date: string;
  user: string;
  aiScore: number;
  finalScore: number;
  agreed: boolean;
  reviewer: string;
  reviewerTitle: string;
  reviewedAt: string;
  aiIssues: AiIssue[];
  finalOpinion: string;
  chat: ChatMsg[];
};

// 客服视角演示数据：均为质检方已复审完成的客诉，得分以人工复审为准。
const AGENT_RECORDS: AgentRecord[] = [
  {
    id: "r1", complaintId: "GD20241009-0087", date: "2024-10-09",
    user: "大有可为双鱼座", aiScore: 95, finalScore: 95, agreed: true,
    reviewer: "王哲", reviewerTitle: "质检人员", reviewedAt: "2024-10-10 09:18",
    aiIssues: [],
    finalOpinion: "认可 AI 评分。应答准确、主动截图指引，玩家一次即解决，表现优秀，维持满分区间。",
    chat: [
      { from: "user", text: "请问新手礼包在哪里领？", time: "2024-10-08 09:10:14" },
      { from: "agent", text: "您好，进入游戏后点击右上角「福利」→「新手礼包」即可一键领取，已为您截图标注。", time: "2024-10-08 09:11:02" },
      { from: "user", text: "找到了，谢谢！", time: "2024-10-08 09:12:37" },
    ],
  },
  {
    id: "r2", complaintId: "GD20241009-0142", date: "2024-10-09",
    user: "用户01363539162", aiScore: 88, finalScore: 96, agreed: false,
    reviewer: "王哲", reviewerTitle: "质检人员", reviewedAt: "2024-10-10 09:25",
    aiIssues: [
      { rule: "缺乏耐心", score: "-2", quote: "「您已经问过了，规则页面都写着呢。」" },
      { rule: "答疑不清", score: "-10", quote: "「规则页面都写着呢，您再仔细看看。」" },
    ],
    finalOpinion: "复审后调整为 96 分。玩家确属重复询问、活动规则页面已有明确说明，客服引导查看规则并无明显不当，「答疑不清」一项判扣不成立，予以撤销；「缺乏耐心」保留提醒但从轻。最终以本意见为准。",
    chat: [
      { from: "user", text: "这个活动的门槛到底是充值满多少？页面写得太绕了。", time: "2024-10-10 10:02:15" },
      { from: "agent", text: "您好，活动规则页面都写着呢，您再仔细看看。", time: "2024-10-10 10:03:02" },
      { from: "user", text: "我看了才来问的，就是没看明白……", time: "2024-10-10 10:04:31" },
      { from: "agent", text: "您已经问过了，规则页面都写着呢。", time: "2024-10-10 10:05:08" },
      { from: "user", text: "行吧。", time: "2024-10-10 10:06:20" },
    ],
  },
  {
    id: "r3", complaintId: "GD20241007-0231", date: "2024-10-07",
    user: "机械鲨富大傻俏", aiScore: 74, finalScore: 68, agreed: false,
    reviewer: "李浩", reviewerTitle: "质检人员", reviewedAt: "2024-10-08 15:36",
    aiIssues: [
      { rule: "安抚不到位", score: "-2", quote: "「这是系统问题，我这边无法处理。」" },
    ],
    finalOpinion: "复审后调整为 68 分。玩家反映充值扣款未到账、情绪明显焦急，客服仅以「系统问题、无法处理」回应即结束对话，既未安抚也未告知后续处理路径（如提交工单、记录反馈），存在漏扣，故在 AI 基础上进一步下调。请后续遇到扣款类问题务必给出明确处理去向。",
    chat: [
      { from: "user", text: "我充值了但是钻石没到账，钱也扣了！", time: "2024-10-11 20:41:09" },
      { from: "agent", text: "这是系统问题，我这边无法处理。", time: "2024-10-11 20:42:25" },
      { from: "user", text: "那我找谁？钱不能白扣啊。", time: "2024-10-11 20:43:52" },
    ],
  },
];

function AgentRecords({ currentUser, onAppeal, onAward }: { currentUser: Account; onAppeal: (rec: AgentRecord, reason: string) => void; onAward: (rec: AgentRecord, reason: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<"appeal" | "award" | null>(null);
  const [actionText, setActionText] = useState("");
  const [actionDone, setActionDone] = useState<"appeal" | "award" | null>(null);
  const records = AGENT_RECORDS;
  const openRec = openId ? records.find(r => r.id === openId) ?? null : null;

  const scoreColor = (s: number) => s >= 90 ? "text-[#27955d]" : s >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]";
  // 按天分组，每天单独统计当天平均分——不跨天混算。
  const dates = Array.from(new Set(records.map(r => r.date))).sort((a, b) => b.localeCompare(a));
  const groups = dates.map(date => {
    const items = records.filter(r => r.date === date);
    const dayAvg = Math.round((items.reduce((a, r) => a + r.finalScore, 0) / items.length) * 10) / 10;
    return { date, items, dayAvg };
  });

  if (openRec) {
    const adjusted = openRec.finalScore !== openRec.aiScore;
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
        <header className="flex h-[58px] items-center gap-3 border-b border-[#e2e6eb] bg-white px-5">
          <button onClick={() => { setOpenId(null); setActionMode(null); setActionText(""); setActionDone(null); }} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
            <ChevronRight className="size-3 rotate-180" />返回
          </button>
          <div>
            <h1 className="text-[15px] font-semibold text-[#2f3b48]">客诉详情</h1>
            <p className="mt-0.5 text-[10px] text-[#8b96a3]">客诉编号 {openRec.complaintId} · {openRec.date} · 玩家 {openRec.user}</p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="mx-auto max-w-[640px] space-y-3">
            {/* 最终结果（主）：人工复审为准 */}
            <div className="rounded-lg border border-[#dbe6f6] bg-white p-4">
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-[#3562c8]">最终质检结果</div>
                  <div className="mt-0.5 text-[10px] text-[#8b97a3]">由质检员 {openRec.reviewer} 复审确定，为你本次客诉的实际得分</div>
                </div>
                <div className="text-right">
                  <div className={`text-[34px] font-bold leading-none ${scoreColor(openRec.finalScore)}`}>{openRec.finalScore}</div>
                  <div className="mt-1 text-[9px] text-[#98a3af]">满分 100</div>
                </div>
              </div>
              <div className="rounded-md bg-[#f6f9ff] px-3 py-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <div className="grid size-7 shrink-0 place-items-center rounded-full bg-[#4d82f6] text-[11px] font-semibold text-white">{openRec.reviewer.slice(0, 1)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-[#33465e]">{openRec.reviewer}</span>
                      <span className="rounded bg-[#eef4ff] px-1.5 py-0.5 text-[9px] text-[#4b7ff0]">{openRec.reviewerTitle}</span>
                    </div>
                    <div className="text-[9px] text-[#9aa4b0]">复审于 {openRec.reviewedAt}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${openRec.agreed ? "bg-[#eaf7f0] text-[#27955d]" : "bg-[#eef4ff] text-[#4b7ff0]"}`}>{openRec.agreed ? "认可 AI 评分" : "调整了 AI 评分"}</span>
                </div>
                <div className="text-[11px] leading-relaxed text-[#4d5966]">{openRec.finalOpinion}</div>
              </div>
            </div>

            {/* 申诉 / 申奖：对复审结论提出异议或自荐为优秀案例 */}
            <div className="rounded-lg border border-[#e6ebf1] bg-white p-4">
              {actionDone ? (
                <div className="flex items-center gap-2 rounded-md bg-[#eef8f2] px-3 py-2.5 text-[11px] text-[#27955d]">
                  <Check className="size-4 shrink-0" />
                  {actionDone === "appeal" ? "申诉已提交，抄送给复审你的质检人员，可在「消息」中查看处理进展。" : "自荐已提交，抄送全体质检人员投票，可在「消息」中查看投票进展。"}
                </div>
              ) : actionMode ? (
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold text-[#35414e]">{actionMode === "appeal" ? "申诉：对本次复审结论提出异议" : "申奖：自荐本条客诉为优秀案例"}</div>
                  <textarea value={actionText} onChange={e => setActionText(e.target.value)} rows={3}
                    placeholder={actionMode === "appeal" ? "请说明申诉理由（将抄送复审你的质检人员）" : "请说明自荐理由（将抄送全体质检人员投票）"}
                    className="w-full resize-none rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]" />
                  <div className="mt-2 flex justify-end gap-2">
                    <button onClick={() => { setActionMode(null); setActionText(""); }}
                      className="rounded-lg border border-[#dbe3ee] bg-white px-3 py-1.5 text-[10px] text-[#6b7a89] transition hover:bg-[#f2f5f9]">取消</button>
                    <button onClick={() => { const t = actionText.trim(); if (!t) return; (actionMode === "appeal" ? onAppeal : onAward)(openRec, t); setActionDone(actionMode); setActionMode(null); setActionText(""); }}
                      className="rounded-lg bg-[#4b7ff0] px-3 py-1.5 text-[10px] font-medium text-white transition hover:bg-[#3d6fe0]">提交{actionMode === "appeal" ? "申诉" : "自荐"}</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="mr-auto text-[10px] text-[#8b96a3]">对这次复审结果有异议，或认为值得成为优秀案例？</p>
                  <button onClick={() => setActionMode("appeal")}
                    className="flex items-center gap-1.5 rounded-lg border border-[#e6c4c4] bg-white px-3 py-1.5 text-[11px] font-medium text-[#c9645f] transition hover:bg-[#fdf6f6]"><AlertCircle className="size-3.5" />申诉</button>
                  <button onClick={() => setActionMode("award")}
                    className="flex items-center gap-1.5 rounded-lg border border-[#e6d3a8] bg-white px-3 py-1.5 text-[11px] font-medium text-[#b9791d] transition hover:bg-[#fdf9f0]"><Award className="size-3.5" />申奖（自荐）</button>
                </div>
              )}
            </div>

            {/* AI 初评（弱化、参考） */}
            <div className="rounded-lg border border-[#eaedf1] bg-[#fbfcfd] p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] font-medium text-[#9aa4b0]">AI 初评（仅供参考）</span>
                <span className="rounded-full bg-[#f0f2f5] px-1.5 py-0.5 text-[9px] text-[#a6b0bc]">最终得分以人工复审为准</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-[#a6b0bc]">
                <span>AI 初评分</span>
                <span className={adjusted ? "text-[#b9c1cb] line-through" : "font-medium text-[#8a94a0]"}>{openRec.aiScore}</span>
                {adjusted && <span className="text-[#b9c1cb]">→ 人工复审已调整为 <span className={`font-semibold ${scoreColor(openRec.finalScore)}`}>{openRec.finalScore}</span></span>}
              </div>
              {openRec.aiIssues.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {openRec.aiIssues.map((it, i) => (
                    <div key={i} className="flex items-start gap-2 rounded bg-white px-2.5 py-1.5 text-[10px] text-[#a6b0bc]">
                      <span className="shrink-0 rounded bg-[#f2f4f7] px-1.5 py-0.5 text-[#98a3af]">{it.rule} {it.score}</span>
                      <span className="leading-relaxed">{it.quote}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-[10px] text-[#b0bbc8]">AI 初评未发现扣分项。</div>
              )}
            </div>

            {/* 对话记录 */}
            <div className="rounded-lg border border-[#e6ebf1] bg-white p-4">
              <div className="mb-2.5 text-[11px] font-semibold text-[#35414e]">对话记录</div>
              <div className="space-y-2">
                {openRec.chat.map((m, i) => (
                  <div key={i} className={`flex ${m.from === "agent" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] rounded-lg px-3 py-1.5 text-[11px] leading-relaxed ${m.from === "agent" ? "bg-[#eaf2ff] text-[#33465e]" : "bg-[#f2f4f7] text-[#4d5966]"}`}>
                      <div className="mb-0.5 text-[9px] text-[#9aa4b0]">{m.from === "agent" ? "客服（你）" : "玩家"} · {m.time}</div>
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5">
        <div>
          <h1 className="text-[15px] font-semibold text-[#2f3b48]">个人记录</h1>
          <p className="mt-0.5 text-[10px] text-[#8b96a3]">{currentUser.name}的每日质检得分与被质检明细</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {groups.length === 0 ? (
          <div className="rounded-lg border border-[#e1e6eb] bg-white px-4 py-8 text-center text-[11px] text-[#b0bbc8]">暂无质检结果，被质检的客诉复审完成后将显示在此</div>
        ) : (
          <div className="space-y-4">
            {groups.map(g => (
              <div key={g.date} className="overflow-hidden rounded-lg border border-[#e1e6eb] bg-white">
                <div className="flex items-center justify-between border-b border-[#e9edf0] bg-[#fafbfc] px-4 py-2.5">
                  <div>
                    <div className="text-[12px] font-semibold text-[#374350]">{g.date}</div>
                    <div className="mt-0.5 text-[10px] text-[#8b97a3]">当日被质检 {g.items.length} 条</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-[#8b97a3]">当日平均分</div>
                    <div className={`text-[18px] font-bold leading-tight ${scoreColor(g.dayAvg)}`}>{g.dayAvg}</div>
                  </div>
                </div>
                <div className="grid grid-cols-[1.4fr_1.1fr_1fr_.6fr_40px] bg-white px-4 py-2 text-[10px] text-[#8b97a3]">
                  <span>客诉编号</span><span>玩家</span><span>质检员</span><span>得分</span><span></span>
                </div>
                {g.items.map(r => (
                  <button key={r.id} onClick={() => { setOpenId(r.id); setActionMode(null); setActionText(""); setActionDone(null); }}
                    className="grid w-full grid-cols-[1.4fr_1.1fr_1fr_.6fr_40px] items-center border-t border-[#edf0f3] px-4 py-2.5 text-left text-[11px] transition hover:bg-[#f8fbff]">
                    <span className="truncate font-medium text-[#465260]">{r.complaintId}</span>
                    <span className="truncate text-[10px] text-[#758291]">{r.user}</span>
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#4d82f6] text-[9px] font-semibold text-white">{r.reviewer.slice(0, 1)}</span>
                      <span className="truncate text-[10px] text-[#5a6572]">{r.reviewer}</span>
                    </span>
                    <span className={`text-[14px] font-bold ${scoreColor(r.finalScore)}`}>{r.finalScore}</span>
                    <span className="flex justify-end text-[#c5cdd6]"><ChevronRight className="size-4" /></span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MessagesView({ currentUser, accounts, messages, excellentCases, onReplyAppeal, onVoteAward, onSendWeekly, onRead }: {
  currentUser: Account;
  accounts: Account[];
  messages: Message[];
  excellentCases: ExcellentCase[];
  onReplyAppeal: (id: string, result: "approved" | "rejected", text: string) => void;
  onVoteAward: (id: string, result: "approve" | "reject") => void;
  onSendWeekly: () => void;
  onRead: (user: Account) => void;
}) {
  const isInspector = currentUser.role !== "agent";
  const isAdmin = currentUser.role === "admin";
  const [filter, setFilter] = useState<"all" | MsgKind>("all");
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  useEffect(() => { onRead(currentUser); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const threshold = Math.max(1, Math.floor(accounts.filter(a => a.role === "inspector" || a.role === "manager").length / 2) + 1);
  const list = visibleMessages(messages, currentUser)
    .filter(m => filter === "all" || m.kind === filter)
    .slice().reverse();

  const kindMeta: Record<MsgKind, { label: string; cls: string; icon: React.ReactNode }> = {
    appeal: { label: "申诉", cls: "bg-[#fdf0ef] text-[#d75d5d]", icon: <AlertCircle className="size-3" /> },
    award: { label: "申奖", cls: "bg-[#fdf6e8] text-[#b9791d]", icon: <Award className="size-3" /> },
    weekly: { label: "优秀案例周报", cls: "bg-[#eaf7f0] text-[#27955d]", icon: <Sparkles className="size-3" /> },
  };
  const tabs: { key: "all" | MsgKind; label: string }[] = [
    { key: "all", label: "全部" }, { key: "appeal", label: "申诉" }, { key: "award", label: "申奖" }, { key: "weekly", label: "周报" },
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5">
        <div>
          <h1 className="text-[15px] font-semibold text-[#2f3b48]">消息</h1>
          <p className="mt-0.5 text-[10px] text-[#8b96a3]">{isInspector ? "处理客服申诉与自荐投票，评选并下发优秀案例" : "查看申诉/申奖进展与每周优秀案例"}</p>
        </div>
        {isAdmin && (
          <button onClick={onSendWeekly} disabled={excellentCases.length === 0}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium transition ${excellentCases.length === 0 ? "cursor-not-allowed bg-[#eef1f5] text-[#b0bbc8]" : "bg-[#4c9e78] text-white hover:bg-[#44916d]"}`}>
            <Send className="size-3.5" />发送本周优秀案例（{excellentCases.length}）
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-[720px]">
          <div className="mb-4 flex gap-1.5">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setFilter(t.key)}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${filter === t.key ? "bg-[#4b7ff0] text-white shadow-sm" : "bg-white text-[#6b7a89] hover:bg-[#eef2f7]"}`}>{t.label}</button>
            ))}
          </div>

          {list.length === 0 ? (
            <div className="rounded-lg border border-[#e1e6eb] bg-white px-4 py-10 text-center text-[11px] text-[#b0bbc8]">暂无消息</div>
          ) : (
            <div className="space-y-3">
              {list.map(m => {
                const meta = kindMeta[m.kind];
                const approve = (m.votes ?? []).filter(v => v.result === "approve").length;
                const reject = (m.votes ?? []).filter(v => v.result === "reject").length;
                const myVote = (m.votes ?? []).find(v => v.by === currentUser.name);
                const canHandleAppeal = m.kind === "appeal" && isInspector && m.to.includes(currentUser.name) && !m.reply;
                const canVote = m.kind === "award" && isInspector && m.status === "pending" && !myVote;
                return (
                  <div key={m.id} className="overflow-hidden rounded-xl border border-[#e6ebf1] bg-white shadow-[0_1px_3px_rgba(41,53,66,.04)]">
                    <div className="flex items-center gap-2 border-b border-[#f0f3f7] px-4 py-2.5">
                      <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.cls}`}>{meta.icon}{meta.label}</span>
                      {m.kind !== "weekly" && <span className="text-[11px] font-medium text-[#465260]">{m.from}</span>}
                      {m.complaintTitle && <span className="text-[10px] text-[#8b97a3]">· {m.complaintTitle}（{m.complaintId}）</span>}
                      <span className="ml-auto text-[10px] text-[#a8b2be]">{m.createdAt}</span>
                    </div>
                    <div className="px-4 py-3">
                      <p className="whitespace-pre-line text-[12px] leading-relaxed text-[#4d5966]">{m.body}</p>

                      {/* 申诉：结论 / 处理入口 */}
                      {m.kind === "appeal" && m.reply && (
                        <div className={`mt-3 rounded-lg px-3 py-2.5 ${m.reply.result === "approved" ? "bg-[#eef8f2]" : "bg-[#fdf0ef]"}`}>
                          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold">
                            <span className={m.reply.result === "approved" ? "text-[#27955d]" : "text-[#d75d5d]"}>{m.reply.result === "approved" ? "申诉通过" : "申诉驳回"}</span>
                            <span className="font-normal text-[#9aa4b0]">· {m.reply.by} · {m.reply.at}</span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-[#4d5966]">{m.reply.text}</p>
                        </div>
                      )}
                      {canHandleAppeal && (
                        <div className="mt-3 border-t border-[#f0f3f7] pt-3">
                          <textarea value={replyDraft[m.id] ?? ""} onChange={e => setReplyDraft(p => ({ ...p, [m.id]: e.target.value }))}
                            placeholder="填写处理说明（客服将看到）" rows={2}
                            className="w-full resize-none rounded-md border border-[#dbe3ee] bg-white px-2.5 py-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]" />
                          <div className="mt-2 flex justify-end gap-2">
                            <button onClick={() => onReplyAppeal(m.id, "rejected", (replyDraft[m.id] ?? "").trim() || "驳回申诉，维持原复审结论。")}
                              className="rounded-lg border border-[#e6c4c4] bg-white px-3 py-1.5 text-[10px] font-medium text-[#c9645f] transition hover:bg-[#fdf6f6]">驳回</button>
                            <button onClick={() => onReplyAppeal(m.id, "approved", (replyDraft[m.id] ?? "").trim() || "申诉成立，将复核该客诉评分。")}
                              className="rounded-lg bg-[#4c9e78] px-3 py-1.5 text-[10px] font-medium text-white transition hover:bg-[#44916d]">通过</button>
                          </div>
                        </div>
                      )}

                      {/* 申奖：投票进度 / 投票入口 */}
                      {m.kind === "award" && (
                        <div className="mt-3 border-t border-[#f0f3f7] pt-3">
                          <div className="flex items-center gap-2 text-[10px] text-[#8b97a3]">
                            <span>赞成 <span className="font-semibold text-[#27955d]">{approve}</span> / 需 {threshold}</span>
                            {reject > 0 && <span>· 反对 {reject}</span>}
                            {m.status === "approved" && <span className="ml-auto flex items-center gap-1 rounded-full bg-[#eaf7f0] px-2 py-0.5 font-medium text-[#27955d]"><Check className="size-3" />已入选优秀案例</span>}
                            {m.status === "pending" && myVote && <span className="ml-auto text-[#a8b2be]">你已投票（{myVote.result === "approve" ? "赞成" : "反对"}）</span>}
                          </div>
                          {canVote && (
                            <div className="mt-2 flex justify-end gap-2">
                              <button onClick={() => onVoteAward(m.id, "reject")}
                                className="rounded-lg border border-[#dbe3ee] bg-white px-3 py-1.5 text-[10px] font-medium text-[#6b7a89] transition hover:bg-[#f2f5f9]">反对</button>
                              <button onClick={() => onVoteAward(m.id, "approve")}
                                className="flex items-center gap-1 rounded-lg bg-[#4b7ff0] px-3 py-1.5 text-[10px] font-medium text-white transition hover:bg-[#3d6fe0]"><ThumbsUp className="size-3" />赞成</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MembersPage({ accounts, onSetRole, onAddMember, onDeleteMember }: { accounts: Account[]; onSetRole: (name: string, role: Role, group?: AgentGroup) => void; onAddMember: (acc: Account) => void; onDeleteMember: (name: string) => void }) {
  const members = accounts.filter(a => a.role !== "admin");
  // 新增成员表单：姓名 + 密码 + 角色下拉 + 新增按钮；角色选「客服人员」时额外显示分组下拉。
  const roleOptions: Role[] = ["manager", "inspector", "agent"];
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("inspector");
  const [newGroup, setNewGroup] = useState<AgentGroup>("一线客服");
  const [err, setErr] = useState("");

  function submitNew() {
    const n = newName.trim();
    if (!n || !newPassword) { setErr("请填写姓名和密码"); return; }
    if (accounts.some(a => a.name === n)) { setErr("该姓名已存在，请更换"); return; }
    onAddMember({ name: n, password: newPassword, role: newRole, group: newRole === "agent" ? newGroup : undefined });
    setNewName(""); setNewPassword(""); setNewRole("inspector"); setNewGroup("一线客服"); setErr("");
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        <h1 className="mb-4 text-[20px] font-semibold text-[#2f3b48]">成员管理</h1>

        {/* 新增成员工具条 */}
        <div className="mb-4 rounded-xl border border-[#e6ebf1] bg-white px-4 py-4 shadow-[0_1px_3px_rgba(41,53,66,.04)]">
          <div className="flex flex-wrap items-center gap-3">
            <input value={newName} onChange={e => { setNewName(e.target.value); if (err) setErr(""); }}
              placeholder="姓名"
              className="h-10 w-[200px] rounded-lg border border-[#dde3ee] bg-[#eef1f8] px-3 text-[13px] text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0] focus:bg-white placeholder-[#9aa6b5]" />
            <input type="password" value={newPassword} onChange={e => { setNewPassword(e.target.value); if (err) setErr(""); }}
              placeholder="密码"
              className="h-10 w-[200px] rounded-lg border border-[#dde3ee] bg-[#eef1f8] px-3 text-[13px] text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0] focus:bg-white placeholder-[#9aa6b5]" />
            <select value={newRole} onChange={e => setNewRole(e.target.value as Role)}
              className="h-10 w-[160px] rounded-lg border border-[#dde3ee] bg-white px-3 text-[13px] text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0]">
              {roleOptions.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
            {newRole === "agent" && (
              <select value={newGroup} onChange={e => setNewGroup(e.target.value as AgentGroup)}
                className="h-10 w-[160px] rounded-lg border border-[#dde3ee] bg-white px-3 text-[13px] text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0]">
                {AGENT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
            <button onClick={submitNew}
              className="h-10 rounded-lg bg-[#4b7ff0] px-5 text-[13px] font-medium text-white transition hover:bg-[#3f72e0]">新增</button>
            {err && <span className="text-[12px] text-[#d75d5d]">{err}</span>}
          </div>
        </div>

        {/* 成员列表 */}
        <div className="overflow-hidden rounded-xl border border-[#e6ebf1] bg-white shadow-[0_1px_3px_rgba(41,53,66,.04)]">
          <div className="grid grid-cols-[1fr_360px_80px] items-center border-b border-[#eef1f4] px-6 py-3 text-[13px] text-[#8b97a3]">
            <span>姓名</span><span>角色 / 客服分组</span><span className="text-right">操作</span>
          </div>
          {members.length === 0 ? (
            <div className="px-6 py-10 text-center text-[13px] text-[#b0bbc8]">暂无成员，使用上方工具条新增成员</div>
          ) : (
            members.map(m => (
              <div key={m.name} className="grid grid-cols-[1fr_360px_80px] items-center border-b border-[#f2f4f7] px-6 py-3.5 text-[14px] last:border-b-0">
                <span className="font-medium text-[#3e4c5a]">{m.name}</span>
                <div className="flex items-center gap-2">
                  <select value={m.role} onChange={e => { const r = e.target.value as Role; onSetRole(m.name, r, r === "agent" ? (m.group ?? "一线客服") : undefined); }}
                    className="h-10 w-[160px] rounded-lg border border-[#dde3ee] bg-white px-3 text-[13px] text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0]">
                    {roleOptions.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                    {!roleOptions.includes(m.role) && <option value={m.role}>{roleLabel(m.role)}</option>}
                  </select>
                  {m.role === "agent" && (
                    <select value={m.group ?? "一线客服"} onChange={e => onSetRole(m.name, "agent", e.target.value as AgentGroup)}
                      className="h-10 w-[160px] rounded-lg border border-[#dde3ee] bg-white px-3 text-[13px] text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0]">
                      {AGENT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  )}
                </div>
                <span className="text-right">
                  <button onClick={() => onDeleteMember(m.name)}
                    className="text-[13px] text-[#e0645f] transition hover:text-[#c94a45]">删除</button>
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AuthScreen({
  authView,
  setAuthView,
  accounts,
  onRegister,
  onLogin,
}: {
  authView: "login" | "register";
  setAuthView: (v: "login" | "register") => void;
  accounts: Account[];
  onRegister: (acc: Account) => void;
  onLogin: (acc: Account) => void;
}) {
  const [role, setRole] = useState<Role>("agent");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const isRegister = authView === "register";

  function switchView(v: "login" | "register") {
    setAuthView(v);
    setName("");
    setPassword("");
    setError("");
  }

  function submit() {
    const n = name.trim();
    if (!n || !password) {
      setError("请填写姓名和密码");
      return;
    }
    if (isRegister) {
      if (accounts.some(a => a.name === n)) {
        setError("该姓名已注册，请直接登录或更换姓名");
        return;
      }
      onRegister({ name: n, password, role });
    } else {
      const found = accounts.find(a => a.name === n);
      if (!found || found.password !== password) {
        setError("姓名或密码不正确");
        return;
      }
      onLogin(found);
    }
  }

  return (
    <div className="grid min-h-0 flex-1 place-items-center bg-[#f7f8fa] p-6">
      <div className="w-full max-w-[300px]">
        <div className="mb-5 flex flex-col items-center">
          <div className="mb-2 grid size-10 place-items-center rounded-lg bg-[#4d82f6] text-[18px] font-bold text-white">Q</div>
          <div className="text-[14px] font-semibold text-[#2f3b48]">质检助手</div>
          <div className="text-[10px] text-[#8b96a3]">{isRegister ? "创建账号" : "登录你的账号"}</div>
        </div>

        {isRegister && (
          <div className="mb-3">
            <div className="mb-1.5 text-[11px] text-[#5a6572]">选择角色</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setRole("agent")}
                className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-[11px] transition ${role === "agent" ? "border-[#4b7ff0] bg-[#eaf2ff] font-medium text-[#3562c8]" : "border-[#dbe3ee] bg-white text-[#66727f] hover:bg-[#f6f9ff]"}`}
              >
                <UserRound className="size-4" />客服
              </button>
              <button
                onClick={() => setRole("inspector")}
                className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-[11px] transition ${role === "inspector" ? "border-[#4b7ff0] bg-[#eaf2ff] font-medium text-[#3562c8]" : "border-[#dbe3ee] bg-white text-[#66727f] hover:bg-[#f6f9ff]"}`}
              >
                <ClipboardCheck className="size-4" />质检人员
              </button>
            </div>
          </div>
        )}

        <div className="mb-3">
          <div className="mb-1.5 text-[11px] text-[#5a6572]">姓名</div>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setError(""); }}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="请输入姓名"
            className="h-9 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-[12px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"
          />
          {isRegister && <div className="mt-1 text-[10px] text-[#e59735]">请填写真实姓名，用于质检记录归属</div>}
        </div>

        <div className="mb-3">
          <div className="mb-1.5 text-[11px] text-[#5a6572]">密码</div>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(""); }}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="请输入密码"
            className="h-9 w-full rounded-md border border-[#dbe3ee] bg-white px-3 text-[12px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"
          />
        </div>

        {error && <div className="mb-3 rounded-md bg-[#fff0f0] px-3 py-2 text-[10px] text-[#d75d5d]">{error}</div>}

        <button
          onClick={submit}
          className="mb-3 h-9 w-full rounded-md bg-[#4b7ff0] text-[12px] font-medium text-white transition hover:bg-[#3f72e0]"
        >
          {isRegister ? "注册并进入" : "登录"}
        </button>

        <div className="text-center text-[11px] text-[#8b97a3]">
          {isRegister ? (
            <>已有账号？<button onClick={() => switchView("login")} className="text-[#4b7ff0] hover:underline">去登录</button></>
          ) : (
            <>没有账号？<button onClick={() => switchView("register")} className="text-[#4b7ff0] hover:underline">去注册</button></>
          )}
        </div>
      </div>
    </div>
  );
}

// 知识库演示种子：可在「规则设置 → 知识库」维护，专用规则的评分维度可引用。
const SEED_KNOWLEDGE: KnowledgeItem[] = [
  { id: "k1", title: "活动规则总览", kind: "link", content: "https://wiki.internal/gamedocs/activity-rules" },
  { id: "k2", title: "精准答疑标准话术", kind: "text", content: "先给结论再给依据；权限外如实告知并同步已提交工单/已记录，不复述文案敷衍。" },
  { id: "k3", title: "充值到账处理流程", kind: "text", content: "核实订单号→查询到账状态→未到账则提交工单并告知处理时效，全程记录反馈。" },
  { id: "k4", title: "常见活动 FAQ", kind: "link", content: "https://wiki.internal/gamedocs/faq" },
];

// 消息中心演示种子：登录质检账号即可看到一条待处理申诉与一条待投票申奖。
const SEED_MESSAGES: Message[] = [
  {
    id: "m1", kind: "appeal", from: "李梦", to: ["王哲"],
    complaintId: "GD20241007-0231", complaintTitle: "充值未到账客诉",
    body: "复审下调到 68 分，我认为当时已建议玩家提交工单并记录了反馈，扣分偏重，申请复核。",
    createdAt: "2024-10-11 09:20", status: "pending", readBy: [],
  },
  {
    id: "m2", kind: "award", from: "李梦", to: ["刁丹", "刘滔", "李浩", "汪翔", "王丽君", "王哲", "王晨", "申慧", "罗晶晶", "阳尹新"],
    complaintId: "GD20241009-0087", complaintTitle: "新手礼包指引",
    body: "自荐本条客诉：主动截图标注领取路径，玩家一次即解决，希望作为优秀案例。",
    createdAt: "2024-10-11 10:05", status: "pending", votes: [], readBy: [],
  },
];

export default function App() {
  const [view, setView] = useState<View>("quality");
  const [closed, setClosed] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([
    { name: "超级管理员", password: "admin", role: "admin" },
    { name: "刁丹", password: "123456", role: "inspector" },
    { name: "刘滔", password: "123456", role: "inspector" },
    { name: "李浩", password: "123456", role: "inspector" },
    { name: "汪翔", password: "123456", role: "inspector" },
    { name: "王丽君", password: "123456", role: "inspector" },
    { name: "王哲", password: "123456", role: "inspector" },
    { name: "王晨", password: "123456", role: "inspector" },
    { name: "申慧", password: "123456", role: "inspector" },
    { name: "罗晶晶", password: "123456", role: "inspector" },
    { name: "阳尹新", password: "123456", role: "inspector" },
  ]);
  // 历史总结反馈埋点：只在内存里累积，仅超级管理者可见（见 view === "feedback"）。
  const [summaryFeedbacks, setSummaryFeedbacks] = useState<SummaryFeedback[]>(SEED_SUMMARY_FEEDBACKS);
  const [currentUser, setCurrentUser] = useState<Account | null>(null);
  const [authView, setAuthView] = useState<"login" | "register">("login");
  const [targetRuleName, setTargetRuleName] = useState<string | null>(null);
  const [targetEditable, setTargetEditable] = useState(false);
  const [backToQuality, setBackToQuality] = useState(false);
  const [openTaskName, setOpenTaskName] = useState<string | null>(null);
  const [openComplaintId, setOpenComplaintId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, Review>>(SEED_REVIEWS);
  const [complaints, setComplaints] = useState<Complaint[]>(COMPLAINTS);
  // 质检任务：提升到 App 层，供「任务管理」与「查看报告」共用同一份真源。
  const [tasks, setTasks] = useState<TaskRow[]>(SEED_TASKS);
  // 已生成并保存的复审报告（仅超级管理员可见与操作）。
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [aiVersion, setAiVersion] = useState(1);
  const [messages, setMessages] = useState<Message[]>(SEED_MESSAGES);
  const [excellentCases, setExcellentCases] = useState<ExcellentCase[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>(SEED_KNOWLEDGE);
  // 客服类型清单：规则的生效范围从这里取值，改这份清单会同步影响所有规则的可选项。
  const [agentTypes, setAgentTypes] = useState<AgentType[]>(SEED_AGENT_TYPES);
  const nextId = useRef(100);
  const genId = () => `x${nextId.current++}`;

  function enter(acc: Account) {
    setCurrentUser(acc);
    setView(acc.role === "agent" ? "records" : "quality");
  }
  function setMemberRole(name: string, role: Role, group?: AgentGroup) {
    setAccounts(prev => prev.map(a => a.name === name ? { ...a, role, group: role === "agent" ? (group ?? a.group ?? "一线客服") : undefined } : a));
    setCurrentUser(cur => cur && cur.name === name ? { ...cur, role, group: role === "agent" ? (group ?? cur.group ?? "一线客服") : undefined } : cur);
  }
  // 新增成员：姓名唯一校验由 MembersPage 内部完成，这里直接写入账号表。
  function addMember(acc: Account) {
    setAccounts(prev => [...prev, acc]);
  }
  function deleteMember(name: string) {
    setAccounts(prev => prev.filter(a => a.name !== name));
    setCurrentUser(cur => cur && cur.name === name ? null : cur);
  }
  function logout() {
    setCurrentUser(null);
    setTargetRuleName(null);
    setTargetEditable(false);
    setBackToQuality(false);
    setOpenTaskName(null);
    setOpenComplaintId(null);
    setReviews(SEED_REVIEWS);
    setComplaints(COMPLAINTS);
    setTasks(SEED_TASKS);
    // 退出时中断所有在跑的报告生成，避免定时器写回已重置的状态。
    Object.values(genTimers.current).forEach(t => clearInterval(t));
    genTimers.current = {};
    setReports([]);
    setAiVersion(1);
    setMessages(SEED_MESSAGES);
    setExcellentCases([]);
    setKnowledge(SEED_KNOWLEDGE);
    setAgentTypes(SEED_AGENT_TYPES);
    setSummaryFeedbacks(SEED_SUMMARY_FEEDBACKS);
    setAuthView("login");
  }
  function goToRule(name: string, editable: boolean) {
    setTargetRuleName(name);
    setTargetEditable(editable);
    setBackToQuality(true);
    setView("rules");
  }
  // 需入选的赞成票数：质检人员总数（含管理者）的过半。
  const inspectorNames = () => accounts.filter(a => a.role === "inspector" || a.role === "manager").map(a => a.name);
  const awardThreshold = () => Math.max(1, Math.floor(inspectorNames().length / 2) + 1);
  const nowStamp = "2024-10-11 11:00";

  // —— 复审报告 ——
  // 分两步：createReport 由用户在弹窗中「新增」一条记录（命名/备注/任务范围即刻确定，状态=生成中），
  // runGeneration 是系统侧的异步生成；成功则把统计与建议固化写入，失败则置为「生成失败」等待重新生成。
  // 生成过程放在 App 层，用户中途切到其他页面也不会中断。
  const genTimers = useRef<Record<string, number>>({});

  function runGeneration(id: string) {
    if (genTimers.current[id]) { clearInterval(genTimers.current[id]); delete genTimers.current[id]; }
    // 演示用：每份报告的「第一次」生成都会中途失败，重新生成则必定成功，
    // 便于完整演示 生成中 → 生成失败 → 重新生成 → 已生成 这条链路。
    let willFail = false;
    setReports(prev => prev.map(r => {
      if (r.id !== id) return r;
      const attempts = r.attempts + 1;
      willFail = attempts === 1;
      return { ...r, status: "generating", failReason: undefined, failedAt: undefined, progress: 0, attempts };
    }));
    // 失败点落在 55%~75% 之间，每次重跑的观感略有不同。
    const failAt = 55 + Math.floor(Math.random() * 21);
    const timer = window.setInterval(() => {
      setReports(prev => {
        const cur = prev.find(r => r.id === id);
        // 报告已被删除：停止该条的生成。
        if (!cur) { clearInterval(timer); delete genTimers.current[id]; return prev; }
        const next = Math.min(100, (cur.progress ?? 0) + (4 + Math.floor(Math.random() * 6)));
        // 失败演示：进度走到失败点即中断，保留当时的进度供用户看到「卡在哪里」。
        if (willFail && next >= failAt) {
          clearInterval(timer);
          delete genTimers.current[id];
          return prev.map(r => r.id === id ? { ...r, status: "failed", progress: next, failReason: "AI 分析服务响应超时，报告未生成完成。任务与复审记录未受影响，可重新生成。", failedAt: nowStamp } : r);
        }
        if (next >= 100) {
          clearInterval(timer);
          delete genTimers.current[id];
          const ids = Array.from(new Set(tasks.filter(t => cur.taskNames.includes(t.name)).flatMap(t => t.complaintIds)));
          const rows = complaints.filter(c => ids.includes(c.id));
          const ops = buildDimOps(rows, reviews, commonCats, privateCats);
          const result: ReportResult = {
            complaintCount: rows.length,
            agreedCount: rows.filter(c => reviews[c.id]?.agreed).length,
            objectionCount: rows.filter(c => { const rv = reviews[c.id]; return !!rv && !rv.agreed && rv.submitted; }).length,
            dimOps: ops,
            principleOps: ops.length > 0 ? suggestPrincipleOps(principles) : [],
          };
          return prev.map(r => r.id === id ? { ...r, ...result, status: "done", progress: 100, failReason: undefined, generatedAt: "2024-10-11 11:20:36" } : r);
        }
        return prev.map(r => r.id === id ? { ...r, progress: next } : r);
      });
    }, 300);
    genTimers.current[id] = timer;
  }

  // 用户新增报告：先落一条「正在生成中」的记录，再触发系统生成。
  function createReport(d: ReportDraft) {
    const id = genId();
    setReports(prev => [{
      ...d, id, status: "generating", progress: 0, attempts: 0,
      complaintCount: 0, agreedCount: 0, objectionCount: 0, dimOps: [], principleOps: [],
      createdAt: "2024-10-11 11:20:36", createdBy: currentUser?.name ?? "超级管理员",
    }, ...prev]);
    runGeneration(id);
    return id;
  }
  function deleteReport(id: string) {
    if (genTimers.current[id]) { clearInterval(genTimers.current[id]); delete genTimers.current[id]; }
    setReports(prev => prev.filter(r => r.id !== id));
  }
  function updateReportNote(id: string, note: string) {
    setReports(prev => prev.map(r => r.id === id ? { ...r, note } : r));
  }

  function sendMessage(m: Omit<Message, "id" | "createdAt" | "readBy">) {
    setMessages(prev => [...prev, { ...m, id: genId(), createdAt: nowStamp, readBy: [m.from] }]);
  }
  // 质检人员处理申诉：写入结论并更新状态。
  function replyAppeal(msgId: string, result: "approved" | "rejected", text: string) {
    if (!currentUser) return;
    setMessages(prev => prev.map(m => m.id === msgId
      ? { ...m, status: result, reply: { by: currentUser.name, text, at: nowStamp, result }, readBy: [m.from] }
      : m));
  }
  // 质检人员对申奖投票：同一人只计一票；赞成过半即入选优秀案例（source: award，去重）。
  function voteAward(msgId: string, result: "approve" | "reject") {
    if (!currentUser) return;
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const votes = [...(m.votes ?? []).filter(v => v.by !== currentUser.name), { by: currentUser.name, result, at: nowStamp }];
      const approve = votes.filter(v => v.result === "approve").length;
      const passed = approve >= awardThreshold();
      if (passed && m.status !== "approved" && m.complaintId) {
        setExcellentCases(ec => ec.some(e => e.complaintId === m.complaintId) ? ec
          : [...ec, { id: genId(), complaintId: m.complaintId!, agent: m.from, title: m.complaintTitle ?? m.complaintId!, summary: m.body, source: "award", addedBy: "质检投票", addedAt: nowStamp }]);
      }
      return { ...m, votes, status: passed ? "approved" : m.status, readBy: [m.from] };
    }));
  }
  // 记录一条历史总结反馈埋点。把反馈发生时的完整定位信息一并固化：谁、什么角色、在哪个任务下
  // 复审哪条客诉、那份总结取材于哪几次历史客诉。之后即使任务被改名或删除，这条埋点也仍然可读。
  function recordSummaryFeedback(taskName: string, c: Complaint, text: string) {
    // 超级管理者是这些反馈的接收方，不作为提交方：入口已按角色隐藏，这里再兜一层。
    if (!currentUser || currentUser.role === "admin" || text.trim() === "") return;
    setSummaryFeedbacks(prev => [{
      id: genId(), at: nowStamp, by: currentUser.name, byRole: currentUser.role,
      taskName, complaintId: c.id, agent: c.agent, user: c.user,
      historyRefs: (c.history ?? []).map(h => ({ id: h.id, date: h.date })),
      text: text.trim(),
    }, ...prev]);
  }
  // 复审时质检人员直接评为/取消优秀案例（source: inspector）。
  function markExcellent(c: Complaint) {
    setExcellentCases(prev => prev.some(e => e.complaintId === c.id) ? prev
      : [...prev, { id: genId(), complaintId: c.id, agent: c.agent, title: `${c.agent} · 用户${c.user}`, summary: `AI 评分 ${c.score} 分，复审认定为优质服务案例。`, source: "inspector", addedBy: currentUser?.name ?? "质检", addedAt: nowStamp }]);
  }
  function unmarkExcellent(complaintId: string) {
    setExcellentCases(prev => prev.filter(e => e.complaintId !== complaintId));
  }
  // 手动下发本周优秀案例：打包成一条周报群发全体客服，随后清空本周池。
  function sendWeeklyDigest() {
    if (excellentCases.length === 0) return;
    const agentNames = accounts.filter(a => a.role === "agent").map(a => a.name);
    const body = `本周共评选出 ${excellentCases.length} 个优秀客诉案例：\n` +
      excellentCases.map((e, i) => `${i + 1}. ${e.agent}｜${e.title}——${e.summary}`).join("\n");
    setMessages(prev => [...prev, {
      id: genId(), kind: "weekly", from: currentUser?.name ?? "质检团队", to: agentNames,
      body, createdAt: nowStamp, status: "approved", readBy: [currentUser?.name ?? ""],
    }]);
    setExcellentCases([]);
  }
  // 进入消息视图：把当前用户可见的消息标记为已读。
  function markMessagesRead(user: Account) {
    setMessages(prev => prev.map(m => {
      const vis = m.kind === "weekly" ? true
        : m.kind === "award" ? (user.role !== "agent" || m.from === user.name)
        : (m.from === user.name || m.to.includes(user.name));
      return vis && !m.readBy.includes(user.name) ? { ...m, readBy: [...m.readBy, user.name] } : m;
    }));
  }
  // 知识库维护：新增/更新/删除。删除时同步从通用/专用规则的各维度引用中移除该条。
  function addKnowledge(item: Omit<KnowledgeItem, "id">) {
    setKnowledge(prev => [...prev, { ...item, id: genId() }]);
  }
  function updateKnowledge(id: string, patch: Partial<Omit<KnowledgeItem, "id">>) {
    setKnowledge(prev => prev.map(k => k.id === id ? { ...k, ...patch } : k));
  }
  function deleteKnowledge(id: string) {
    setKnowledge(prev => prev.filter(k => k.id !== id));
    const dropRef = (cats: Cat[]) => cats.map(c => c.knowledgeIds?.includes(id) ? { ...c, knowledgeIds: c.knowledgeIds.filter(x => x !== id) } : c);
    setCommonCats(dropRef);
    setPrivateCats(dropRef);
  }
  // —— 客服类型清单维护 ——
  // 类型名同时是规则里 scopes / variants 的键，所以改名、删除都必须连带迁移规则，
  // 否则规则会指向一个已不存在的类型，界面上表现为「生效范围少了一类」的静默丢失。
  function addAgentType(name: string) {
    const t = name.trim();
    if (t === "" || agentTypes.includes(t)) return;
    setAgentTypes(prev => [...prev, t]);
    // 新类型默认不进入既有规则：既有规则的 scopes 为 undefined 时本就代表「全部客服」，
    // 会自动把新类型纳入；显式收窄过的规则则保持原样，交由用户按需勾选。
  }
  function renameAgentType(oldName: string, name: string) {
    const t = name.trim();
    if (t === "" || t === oldName || agentTypes.includes(t)) return;
    setAgentTypes(prev => prev.map(x => x === oldName ? t : x));
    const migrate = (cats: Cat[]) => cats.map(c => ({
      ...c,
      defaultScopes: c.defaultScopes?.map(x => x === oldName ? t : x),
      dimensions: c.dimensions.map(d => {
        const next = cloneDim(d);
        if (next.scopes) next.scopes = next.scopes.map(x => x === oldName ? t : x);
        if (next.variants && oldName in next.variants) {
          const v = { ...next.variants };
          v[t] = v[oldName]; delete v[oldName];
          next.variants = v;
        }
        return next;
      }),
    }));
    setCommonCats(migrate);
    setPrivateCats(migrate);
  }
  function deleteAgentType(name: string) {
    // 至少留一类，否则规则的生效范围无从选择。
    if (agentTypes.length <= 1) return;
    setAgentTypes(prev => prev.filter(x => x !== name));
    const drop = (cats: Cat[]) => cats.map(c => ({
      ...c,
      defaultScopes: c.defaultScopes?.filter(x => x !== name),
      dimensions: c.dimensions.map(d => {
        const next = cloneDim(d);
        if (next.scopes) next.scopes = next.scopes.filter(x => x !== name);
        if (next.variants) delete next.variants[name];
        // 只对被删类型生效的规则，删完范围就空了——回落为「全部客服」而不是留一条死规则，
        // 并在类型管理页提前把这个后果说清楚。
        return normalizeDim(next);
      }),
    }));
    setCommonCats(drop);
    setPrivateCats(drop);
  }
  // 某个客服类型被多少条规则「点名」引用（显式写进 scopes 的才算，全部客服的不计）。
  function agentTypeRefCount(name: string) {
    const count = (cats: Cat[]) => cats.reduce((n, c) => n + c.dimensions.filter(d => d.scopes?.includes(name)).length, 0);
    return count(commonCats) + count(privateCats);
  }
  // 重新运行任务：AI 采纳复审意见后重新评分——被判扣分不合理的规则不再扣分，
  // AI 自评分向质检人员建议分靠拢；同时保留质检人员的意见与分数。
  function rerunTask() {
    setComplaints(prev => prev.map(c => {
      const r = reviews[c.id];
      if (r && !r.agreed && r.submitted) {
        const { newScore, remaining } = rescore(c, r.objectedRules);
        return { ...c, score: newScore, aiIssues: remaining };
      }
      return c;
    }));
    setAiVersion(v => v + 1);
  }

  const initCommonCats: Cat[] = [
    {
      name: "服务态度",
      expanded: false,
      enabled: true,
      renaming: false,
      dimensions: [
        {
          // 收窄生效范围、但不分叉：AI 客服无语气可言，专属/高潜客服另有更严的话术要求，
          // 这一条只用来约束一线客服。
          title: "缺乏耐心",
          score: "-2",
          standard: "面对反复确认、多轮追问时的语气",
          criteria: "不扣：全程平和认真；-2：明显不耐烦、催促结束、推诿、关闭对话过快。不适用：无多轮追问、对话简短平顺",
          scopes: ["一线客服"],
        },
        {
          // 三类客服都要安抚，但要求不同：一线看「有没有安抚」，VIP 与专属看「安抚得够不够、
          // 有没有给确定时限」。分值统一 -2，只有判断标准分叉。
          title: "安抚不到位",
          score: "-2",
          standard: "玩家带情绪时是否有针对性安抚",
          criteria: "不扣：有安抚、情绪与事实分开处理；-2：完全未安抚或安抚过于简单敷衍。不适用：玩家全程情绪平稳、纯咨询",
          scopes: ["一线客服", "VIP一线客服", "专属客服"],
          variants: {
            "VIP一线客服": "不扣：主动识别情绪并致歉、同时给出确定的处理时限；-2：仅口头「稍等」「已记录」而未给时限，或情绪波动时未先安抚再讲事实。不适用：玩家全程情绪平稳、纯咨询。",
            "专属客服": "不扣：以专属身份主动承接情绪、明确后续由本人跟进到底；-2：未表明专属跟进关系、把玩家推回公共客服流程，或安抚后无任何跟进承诺。不适用：玩家全程情绪平稳、纯咨询。",
          },
        },
      ],
    },
  ];
  const [commonCats, setCommonCats] = useState(initCommonCats);
  const initPrivateCats: Cat[] = [
    {
      name: "咨询类",
      expanded: false,
      enabled: true,
      renaming: false,
      tags: ["咨询类", "活动/玩法咨询", "礼包/付费咨询", "游戏设置咨询", "免费福利/添加咨询"],
      knowledgeIds: ["k1", "k2", "k4"],
      dimensions: [
        // 全部客服都要考「答没答到点」，但 AI 客服判的是「有没有正确转人工」，与人工客服不同。
        { title: "精准答疑", score: "-5", standard: "是否直接对应玩家的活动/玩法/福利/游戏设置具体疑问，结论清晰、不堆文案、不绕弯", criteria: "不扣：直接命中疑问、结论明确，玩家无需追问；或已跟进/已提交工单/已查询告知/权限外如实告知；-2：答了核心但夹带无关文案/表述绕/需再追问一次；-5：只复述活动规则文案、模板话术敷衍、答非所问或对核心疑问完全无任何跟进与回应。",
          variants: { "AI客服": "不扣：命中知识库并给出明确结论，或识别为超出可答范围后主动转人工；-2：答了核心但夹带无关文案，需玩家再追问一次；-5：答非所问、循环追问同一问题超过两轮仍未转人工。" } },
        { title: "主动服务与延伸", score: "-2", standard: "是否主动查数据、给出与活动场景相关的延伸建议", criteria: "不扣：主动给出至少一条切实建议或主动查了数据；-2：有明显可延伸点（道具会过期、有更优兑换顺序）却未提醒，或可查数据却让玩家自己找，或该提供活动规则/发放记录截图帮理解却未提供致玩家没看懂。不适用：一次性规则确认、无后续动作可建议（标「无可延伸场景」）。" },
        { title: "回复错误", score: "-3", standard: "对活动内容的事实性解答是否正确", criteria: "-3：对玩法、活动设置、渠道/版本区分、数据查询等作出事实性错误解答。与「精准答疑」区别：精准答疑是没答到点，回复错误是答了但答错。与「回复不全面」区别：说法本身正确但不完整/只引导玩家自行查看 → 归「回复不全面 -2」，不算回复错误；仅当所述内容与事实矛盾时才判本项。已查询并如实告知结果的，即便玩家不认可，也不算回复错误。" },
        { title: "流程问题", score: "-3", standard: "是否符合本场景处理流程", criteria: "-3：处理流程错误或缺失。本场景多为直接答疑、无固定流程，多数情况标「本场景无流程要求」不扣。" },
        { title: "回复不全面", score: "-2", standard: "活动细节与操作引导是否完整", criteria: "-2：活动细节解释不全面、未维护官方形象、漏答问题、该引导活动操作而未引导或引导不完整。不适用：疑问一两句即可讲清、无细节可补。" },
      ],
    },
    {
      name: "打不死鱼",
      expanded: false,
      enabled: true,
      renaming: false,
      tags: ["打不死鱼"],
      dimensions: [
        { title: "精准答疑", score: "-5", standard: "是否直接命中玩家疑问、结论明确", criteria: "不扣：直接命中疑问、结论明确，玩家无需追问；或已跟进/已提交工单/已查询告知/权限外如实告知；-2：答了核心但夹带无关文案/表述绕/需再追问一次；-5：只复述活动规则文案、模板话术敷衍、答非所问或对核心疑问完全无任何跟进与回应。" },
        { title: "主动服务与延伸", score: "-2", standard: "是否主动给出建议或主动查数据", criteria: "不扣：主动给出至少一条切实建议或主动查了数据；-2：有明显可延伸点（道具会过期、有更优兑换顺序）却未提醒，或可查数据却让玩家自己找，或该提供活动规则/发放记录截图帮理解却未提供致玩家没看懂。不适用：一次性规则确认、无后续动作可建议（标「无可延伸场景」）。" },
        { title: "回复错误", score: "-3", standard: "事实性解答是否正确", criteria: "-3：对玩法、活动设置、渠道/版本区分、数据查询等作出事实性错误解答。与「精准答疑」区别：精准答疑是没答到点，回复错误是答了但答错。与「回复不全面」区别：说法本身正确但不完整/只引导玩家自行查看 → 归「回复不全面 -2」，不算回复错误；仅当所述内容与事实矛盾时才判本项。已查询并如实告知结果的，即便玩家不认可，也不算回复错误。" },
        { title: "流程问题", score: "-3", standard: "是否符合本场景处理流程", criteria: "-3：处理流程错误或缺失。本场景多为直接答疑、无固定流程，多数情况标「本场景无流程要求」不扣。" },
        { title: "回复不全面", score: "-2", standard: "细节解释与操作引导是否完整", criteria: "-2：活动细节解释不全面、未维护官方形象、漏答问题、该引导活动操作而未引导或引导不完整。不适用：疑问一两句即可讲清、无细节可补。" },
      ],
    },
    {
      name: "充值类",
      expanded: false,
      enabled: true,
      renaming: false,
      tags: ["充值类", "付费咨询"],
      knowledgeIds: ["k3"],
      dimensions: [
        { title: "精准答疑", score: "-5", standard: "是否直接命中充值相关疑问、结论明确", criteria: "不扣：直接命中疑问、结论明确，玩家无需追问；或已跟进/已提交工单/已查询告知/权限外如实告知；-2：答了核心但夹带无关文案/表述绕/需再追问一次；-5：只复述文案、模板话术敷衍、答非所问或对核心疑问完全无任何跟进与回应。" },
        { title: "主动服务与延伸", score: "-2", standard: "是否主动关怀充值玩家、给出延伸服务", criteria: "-2：有明显关怀延伸点却未提。不适用：纯机制确认无后续可关怀。" },
        { title: "回复错误", score: "-3", standard: "充值机制/到账/渠道等事实性解答是否正确", criteria: "-3：对充值机制、到账规则、渠道/版本区分、数据查询等作出事实性错误解答。已查询并如实告知结果的，即便玩家不认可，也不算回复错误。" },
        { title: "流程问题", score: "-3", standard: "充值问题处理流程是否规范", criteria: "-3：处理流程错误或缺失（如未按扣款/到账核实流程提交工单、记录反馈）。无固定流程场景标「本场景无流程要求」不扣。" },
        { title: "回复不全面", score: "-2", standard: "是否肯定玩家投入并给出具象建议", criteria: "-2：仅空泛安慰、未肯定老玩家投入、未给具象化建议或引导不完整。" },
      ],
    },
  ];
  const [privateCats, setPrivateCats] = useState(initPrivateCats);
  const initPrinciples: Principle[] = [
    { title: "默认满分，见问题才扣", content: "每通对话起始 100 分，只有命中扣分触发条件才扣分，不凭印象打分。" },
    { title: "扣分必引原句", content: "每处扣分都要注明扣了哪一项、扣几分，并附上对话原句作为依据。" },
    { title: "不适用即不扣", content: "某项在本通对话根本不涉及时，标注「不适用」并说明理由，不扣分也不送分。" },
    { title: "实质回应从宽认定", content: "客服已记录/已提交工单/已查询告知/权限外如实告知的，视为已实质回应，不判核心封顶。" },
  ];
  const [principles, setPrinciples] = useState(initPrinciples);
  // —— 规则版本管理：versions[0] 为最新已保存版本；工作副本即上面的 commonCats/privateCats/principles ——
  // 演示数据：已累计提交 34 个版本，超过 30 版上限，最早的 v1~v4 已被自动清理，
  // 仅保留最近 30 个版本（v5 ~ v34）。
  const seedVersions = (): RuleVersion[] => {
    const notes: Record<number, string> = {
      34: "上调「精准答疑」封顶扣分至 -5",
      33: "新增「敷衍用户」维度",
      32: "细化「安抚不到位」判断标准",
      31: "调整「缺乏耐心」适用范围",
      5: "补充活动/福利专用规则门类",
    };
    const list: RuleVersion[] = [];
    for (let seq = 34; seq >= 5; seq--) {
      list.push({
        id: `v${seq}`, seq,
        note: notes[seq] ?? `第 ${seq} 次规则调整`,
        author: seq % 2 === 0 ? "超级管理员" : "李伟",
        savedAt: `2026-07-${pad2(((seq - 5) % 8) + 20)} ${pad2(9 + (seq % 8))}:${pad2((seq * 7) % 60)}`,
        commonCats: initCommonCats.map(hydrateCat), privateCats: initPrivateCats.map(hydrateCat), principles: initPrinciples,
      });
    }
    return list;
  };
  const [versions, setVersions] = useState<RuleVersion[]>(seedVersions);
  // 累计提交过的版本总数（含已被清理的），用于展示“已清理 N 个更早版本”。
  const [totalSeq, setTotalSeq] = useState(34);
  // 当前正在「查看」的历史版本（null = 正在编辑工作副本）。
  const [viewingVersionId, setViewingVersionId] = useState<string | null>(null);
  const latestVersion = versions[0];
  const isDirty = rulesFingerprint(commonCats, privateCats, principles) !== rulesFingerprint(latestVersion.commonCats, latestVersion.privateCats, latestVersion.principles);

  // 提交新版本前的封顶淘汰逻辑：纯滚动淘汰，只保留最近 30 版，超出即丢弃最早的。
  const capVersions = (list: RuleVersion[]) => list.slice(0, MAX_VERSIONS);

  function saveVersion(note: string) {
    const seq = latestVersion.seq + 1;
    const now = new Date();
    const v: RuleVersion = {
      id: `v${seq}`, seq, note: note.trim() || `版本 v${seq}`,
      author: currentUser?.name ?? "—", savedAt: fmtVersionTime(now),
      commonCats: commonCats.map(hydrateCat), privateCats: privateCats.map(hydrateCat), principles: principles.map(p => ({ ...p })),
    };
    setVersions(prev => capVersions([v, ...prev]));
    setTotalSeq(seq);
    setViewingVersionId(null);
  }
  // 放弃未保存改动，回到最新版本内容。
  function discardChanges() {
    setCommonCats(latestVersion.commonCats.map(hydrateCat));
    setPrivateCats(latestVersion.privateCats.map(hydrateCat));
    setPrinciples(latestVersion.principles.map(p => ({ ...p })));
    setViewingVersionId(null);
  }
  // 回滚到某历史版本：把该版本内容原子地提交为一个新版本（线性递增，不产生分支），
  // 当前工作副本即变为该内容且与最新版一致（不留「未保存」态）。
  function restoreVersion(id: string) {
    const src = versions.find(x => x.id === id);
    if (!src) return;
    const seq = latestVersion.seq + 1;
    const now = new Date();
    const v: RuleVersion = {
      id: `v${seq}`, seq, note: `回滚自 ${src.id}${src.note ? `（${src.note}）` : ""}`,
      author: currentUser?.name ?? "—", savedAt: fmtVersionTime(now),
      commonCats: src.commonCats.map(hydrateCat), privateCats: src.privateCats.map(hydrateCat), principles: src.principles.map(p => ({ ...p })),
    };
    setVersions(prev => capVersions([v, ...prev]));
    setTotalSeq(seq);
    setCommonCats(v.commonCats.map(hydrateCat));
    setPrivateCats(v.privateCats.map(hydrateCat));
    setPrinciples(v.principles.map(p => ({ ...p })));
    setViewingVersionId(null);
  }
  if (closed)
    return (
      <main className="grid h-dvh place-items-center bg-[#edf1f4] font-['Noto_Sans_SC']">
        <button
          onClick={() => setClosed(false)}
          className="rounded-lg bg-[#4b7ff0] px-4 py-2 text-[12px] text-white"
        >
          重新打开质检助手
        </button>
      </main>
    );
  return (
    <main className="h-dvh w-screen overflow-hidden bg-white font-['Noto_Sans_SC'] text-[#4d5966]">
      <section className="flex h-full w-full overflow-hidden bg-white">
        {currentUser && <PluginSidebar view={view} setView={(v) => { setBackToQuality(false); setView(v); }} currentUser={currentUser} messages={messages} pendingFeedback={summaryFeedbacks.length} onLogout={logout} />}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-8 shrink-0 items-center justify-end border-b border-[#edf0f2] bg-[#fbfcfd] px-3">
            <button
              onClick={() => setClosed(true)}
              className="text-[#85919d] hover:text-[#3e4c5a]"
            >
              <X className="size-3.5" />
            </button>
          </div>
          {!currentUser ? (
            <AuthScreen authView={authView} setAuthView={setAuthView} accounts={accounts} onRegister={acc => { setAccounts(prev => [...prev, acc]); enter(acc); }} onLogin={enter} />
          ) : view === "records" ? (
            <AgentRecords currentUser={currentUser}
              onAppeal={(rec, reason) => sendMessage({ kind: "appeal", from: currentUser.name, to: [rec.reviewer], complaintId: rec.complaintId, complaintTitle: `${rec.date} 客诉复审`, body: reason, status: "pending" })}
              onAward={(rec, reason) => sendMessage({ kind: "award", from: currentUser.name, to: inspectorNames(), complaintId: rec.complaintId, complaintTitle: `${rec.date} 客诉自荐`, body: reason, status: "pending", votes: [] })}
            />
          ) : view === "messages" ? (
            <MessagesView currentUser={currentUser} accounts={accounts} messages={messages} excellentCases={excellentCases} onReplyAppeal={replyAppeal} onVoteAward={voteAward} onSendWeekly={sendWeeklyDigest} onRead={markMessagesRead} />
          ) : view === "quality" ? (
            <QualityHome commonCats={commonCats} privateCats={privateCats} complaints={complaints} aiVersion={aiVersion} currentRuleVersion={latestVersion.id} rerunTask={rerunTask} openTaskName={openTaskName} setOpenTaskName={setOpenTaskName} openComplaintId={openComplaintId} setOpenComplaintId={setOpenComplaintId} reviews={reviews} setReviews={setReviews} excellentCases={excellentCases} markExcellent={markExcellent} unmarkExcellent={unmarkExcellent} tasks={tasks} setTasks={setTasks} onGoToRuleView={(name) => goToRule(name, false)} canFeedback={currentUser.role !== "admin"} onSummaryFeedback={recordSummaryFeedback}/>
          ) : view === "feedback" && currentUser.role === "admin" ? (
            <SummaryFeedbackPage feedbacks={summaryFeedbacks} />
          ) : view === "reports" && currentUser.role === "admin" ? (
            <ReportsPage tasks={tasks} complaints={complaints} reviews={reviews} versions={versions}
              reports={reports} onCreateReport={createReport} onRegenerate={runGeneration} onDeleteReport={deleteReport} onUpdateNote={updateReportNote} />
          ) : view === "members" ? (
            <MembersPage accounts={accounts} onSetRole={setMemberRole} onAddMember={addMember} onDeleteMember={deleteMember} />
          ) : (
            <RulesPage commonCats={commonCats} setCommonCats={setCommonCats} privateCats={privateCats} setPrivateCats={setPrivateCats} principles={principles} setPrinciples={setPrinciples} knowledge={knowledge} onAddKnowledge={addKnowledge} onUpdateKnowledge={updateKnowledge} onDeleteKnowledge={deleteKnowledge} agentTypes={agentTypes} onAddAgentType={addAgentType} onRenameAgentType={renameAgentType} onDeleteAgentType={deleteAgentType} agentTypeRefCount={agentTypeRefCount} targetRuleName={targetRuleName} targetEditable={targetEditable} onTargetConsumed={() => { setTargetRuleName(null); setTargetEditable(false); }} onRulesModified={() => {}} showBack={backToQuality} onBack={backToQuality ? () => { setView("quality"); setBackToQuality(false); } : undefined} readOnly={!canEditRules(currentUser.role)}
              versions={versions} latestVersion={latestVersion} totalSeq={totalSeq} isDirty={isDirty} viewingVersionId={viewingVersionId} setViewingVersionId={setViewingVersionId} onSaveVersion={saveVersion} onDiscardChanges={discardChanges} onRestoreVersion={restoreVersion}/>
          )}
        </div>
      </section>
    </main>
  );
}