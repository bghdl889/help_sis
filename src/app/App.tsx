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
  Send,
  FileText,
  CalendarDays,
  MessageSquareWarning,
  Lightbulb,
  BarChart3,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart as RechartsLineChart,
  Line as RechartsLine,
  CartesianGrid,
  Legend,
  Label,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

type Role = "agent" | "inspector" | "manager" | "admin";
type AgentGroup = "一线客服" | "VIP一线客服" | "高潜客服" | "VIP客服";
const AGENT_GROUPS: AgentGroup[] = ["一线客服", "VIP一线客服", "高潜客服", "VIP客服"];
type Account = { name: string; password: string; role: Role; group?: AgentGroup };
type View = "daily" | "trend" | "appeals" | "agentAppeals" | "sentiment" | "quality" | "aiRecords" | "rules" | "records" | "members" | "reports" | "feedback";
type DashboardUpdateNotice = { id: number; message: string; at: string };
const roleLabel = (r: Role) => r === "admin" ? "超级管理者" : r === "manager" ? "业务管理者" : r === "inspector" ? "质检人员" : "客服人员";
const canEditRules = (r: Role) => r === "manager" || r === "admin";

// 知识库：全局条目，可被专用规则的各评分维度引用。内容可为文本或外部链接。
type KnowledgeItem = { id: string; title: string; kind: "text" | "link"; content: string };
type ChatMsg = { from: "user" | "agent"; text: string; time: string };
type AiIssue = { rule: string; score: string; quote: string; reason?: string };
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
  aiSuggestion?: string;
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
  appealResolved?: boolean;
  appealAccepted?: boolean;
  reviewerScore?: number;
  reviewerName?: string;
  reviewedAt?: string;
  reviewerOpinion?: string;
  customerMessage?: string;
  source?: "manual" | "agentAppeal";
};
type AppealRecord = {
  id: string;
  complaintId: string;
  agent: string;
  agentType: string;
  user: string;
  objectedRules: string[];
  reason: string;
  result: string;
  status: "待处理" | "已采纳" | "已驳回";
  reviewer: string;
  reviewedAt: string;
  originalScore: number;
  finalScore: number;
  accepted: boolean;
  reviewerOpinion: string;
  customerMessage: string;
};
type AgentAppealState = {
  id: string;
  complaintId: string;
  agent: string;
  submittedScore: number;
  objectedRules: string[];
  reason: string;
  submittedAt: string;
  status: "pending" | "accepted" | "rejected";
  baseSource: "ai" | "manual";
  reviewerScore?: number;
  reviewerOpinion?: string;
  customerMessage?: string;
  reviewerName?: string;
  reviewedAt?: string;
  seenByAgent: boolean;
};
type EffectiveQualityResult = {
  complaintId: string;
  date: string;
  aiScore: number;
  aiIssues: AiIssue[];
  publicationStatus: "manualPending" | "published" | "appealPending" | "resolved";
  source: "ai" | "manual" | "appeal";
  baseSource: "ai" | "manual";
  effectiveScore: number;
  effectiveIssues: AiIssue[];
  manualReview?: Review;
  appeal?: AgentAppealState;
  visibleToAgent: boolean;
};
type Principle = { title: string; content: string; scopes?: AgentType[] };
const principleApplies = (p: Principle, t: AgentType) => !p.scopes || p.scopes.length === 0 || p.scopes.includes(t);

// —— 质检任务 ——
// complaintIds：本任务实际纳入的客诉。报告模块据此判断「该任务客诉是否已全部复审完」。
type TaskFilters = { date: string; rounds: string; limit: string; statuses: string[]; vipMin: string; vipMax: string; includeTags: string[]; excludeTags: string[]; agents: string[] };
type TaskRow = { name: string; status: string; note: string; date: string; ruleVersion: string; complaintIds: string[]; filters?: TaskFilters };
type HumanReviewQueueItem = {
  complaintId: string;
  date: string;
  reasons: string[];
  arrivedAt: string;
};

const HUMAN_REVIEW_QUEUE: HumanReviewQueueItem[] = [
  { complaintId: "c1", date: "2024-10-11", reasons: ["玩家重复追问", "客服回复存在明显对立表达", "活动规则咨询"], arrivedAt: "10:08" },
  { complaintId: "c5", date: "2024-10-11", reasons: ["玩家存在退款投诉倾向", "重复客诉", "已生成升级工单"], arrivedAt: "10:42" },
  { complaintId: "c6", date: "2024-10-11", reasons: ["玩家多次追问到账进度", "客服承诺时效需要核验"], arrivedAt: "11:06" },
];

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
type ReportResult = { totalScore: number; accuracyRate: number; complaintCount: number; agreedCount: number; objectionCount: number; dimOps: DimOp[]; principleOps: PrincipleOp[] };
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

type DimTypeGroup = {
  agentTypes: AgentType[];
  hitCount: number;
  overturnedCount: number;
  prob: number;
  oldCriteria: string;
  newCriteria?: string;
  label?: string;
};

type DimOp = { op: "修改" | "新增" | "删除"; title: string; scope: "通用" | "专用"; catName: string; freq: number; prob: number; standard: string; oldCriteria?: string; newCriteria?: string; score?: string; reason: string; typeGroups?: DimTypeGroup[] };
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

// 不同客服类型的标准可能只是标点、空格或少量措辞不同。用二元短片段比较，
// 只有达到较高相似度才合并，避免把已有明显 variants 的类型错误地归为一组。
function criteriaSimilar(a: string, b: string): boolean {
  const normalize = (text: string) => text.toLowerCase().replace(/\s/g, "").replace(/[，。、“”‘’；：？！,.;:'"!?（）()【】{}<>·、—-]/g, "");
  const left = normalize(a);
  const right = normalize(b);
  if (left === right) return true;
  if (!left || !right) return false;
  const grams = (text: string) => new Set(text.length < 2 ? [text] : Array.from({ length: text.length - 1 }, (_, i) => text.slice(i, i + 2)));
  const aGrams = grams(left);
  const bGrams = grams(right);
  let common = 0;
  aGrams.forEach(g => { if (bGrams.has(g)) common += 1; });
  return (2 * common) / (aGrams.size + bGrams.size) >= 0.84;
}

function canMergeTypeGroups(a: DimTypeGroup, b: DimTypeGroup): boolean {
  return criteriaSimilar(a.oldCriteria, b.oldCriteria) && criteriaSimilar(a.newCriteria ?? "", b.newCriteria ?? "");
}

// 结合本次复审，生成对「评分维度」的调整建议：修改（收紧判断标准）／删除（高频全量误扣）／新增（AI 漏扣需补充维度）。
function buildDimOps(complaints: Complaint[], reviews: Record<string, Review>, commonCats: Cat[], privateCats: Cat[], agentTypes: AgentType[]): DimOp[] {
  const objectedTitles = new Set<string>();
  let underScored = false; // 存在人工判分低于 AI（AI 漏扣）
  complaints.forEach(c => {
    const r = reviews[c.id];
    const reviewed = !!r && (r.agreed || r.submitted);
    if (!reviewed) return;
    r.objectedRules.forEach(rule => {
      const loc = locateDim(rule, commonCats, privateCats);
      if (!loc || dimApplies(loc.dim, c.agentType)) objectedTitles.add(rule);
    });
    const sug = Number(r.suggestedScore);
    if (r.suggestedScore.trim() !== "" && !Number.isNaN(sug) && sug < c.score) underScored = true;
  });

  const ops: DimOp[] = Array.from(objectedTitles).map(title => {
    const loc = locateDim(title, commonCats, privateCats);
    // 不适用该客服类型的规则不纳入该类型统计，避免把规则范围外的客诉算成误判。
    const issueRows = complaints.filter(c => {
      const r = reviews[c.id];
      return !!r && (r.agreed || r.submitted) && (!loc || dimApplies(loc.dim, c.agentType)) && c.aiIssues.some(i => i.rule === title);
    });
    const typeStats = new Map<AgentType, { hitCount: number; overturnedCount: number }>();
    issueRows.forEach(c => {
      const current = typeStats.get(c.agentType) ?? { hitCount: 0, overturnedCount: 0 };
      current.hitCount += 1;
      const r = reviews[c.id];
      if (!!r && r.submitted && !r.agreed && r.objectedRules.includes(title)) current.overturnedCount += 1;
      typeStats.set(c.agentType, current);
    });
    const typeGroups: DimTypeGroup[] = [];
    const applicableTypes = loc ? agentTypes.filter(agentType => dimApplies(loc.dim, agentType)) : Array.from(new Set(issueRows.map(c => c.agentType)));
    const allTypesShareCriteria = !!loc && applicableTypes.length > 0 && applicableTypes.every(agentType => criteriaSimilar(criteriaFor(loc.dim, applicableTypes[0]), criteriaFor(loc.dim, agentType)));
    const shouldLabelAll = !!loc && applicableTypes.length === agentTypes.length && allTypesShareCriteria;
    if (shouldLabelAll) {
      const stats = issueRows.reduce((sum, c) => {
        sum.hitCount += 1;
        const r = reviews[c.id];
        if (!!r && r.submitted && !r.agreed && r.objectedRules.includes(title)) sum.overturnedCount += 1;
        return sum;
      }, { hitCount: 0, overturnedCount: 0 });
      const oldCriteria = criteriaFor(loc.dim, applicableTypes[0]);
      typeGroups.push({
        agentTypes: applicableTypes, label: "全部客服", hitCount: stats.hitCount, overturnedCount: stats.overturnedCount,
        prob: Math.round((stats.overturnedCount / Math.max(stats.hitCount, 1)) * 100), oldCriteria, newCriteria: suggestNewCriteria(title, oldCriteria),
      });
    } else {
      typeStats.forEach((stats, agentType) => {
        const oldCriteria = loc ? criteriaFor(loc.dim, agentType) : "";
        const newCriteria = suggestNewCriteria(title, oldCriteria);
        const raw: DimTypeGroup = {
          agentTypes: [agentType], hitCount: stats.hitCount, overturnedCount: stats.overturnedCount,
          prob: Math.round((stats.overturnedCount / Math.max(stats.hitCount, 1)) * 100), oldCriteria, newCriteria,
        };
        const merged = typeGroups.find(group => canMergeTypeGroups(group, raw));
        if (merged) {
          merged.agentTypes.push(agentType);
          merged.hitCount += raw.hitCount;
          merged.overturnedCount += raw.overturnedCount;
          merged.prob = Math.round((merged.overturnedCount / Math.max(merged.hitCount, 1)) * 100);
        } else {
          typeGroups.push(raw);
        }
      });
    }

    const freq = issueRows.filter(c => {
      const r = reviews[c.id];
      return !!r && r.submitted && !r.agreed && r.objectedRules.includes(title);
    }).length;
    const denom = Math.max(issueRows.length, freq);
    const prob = Math.round((freq / Math.max(denom, 1)) * 100);
    const scope = loc?.scope ?? "通用";
    const catName = loc?.catName ?? "—";
    const standard = loc?.dim.standard ?? "";
    const oldCriteria = loc?.dim.criteria ?? "";
    // 该维度每次触发都被人工推翻（且样本≥2），判定为整体不可靠，建议删除
    if (prob >= 100 && denom >= 2) {
      return { op: "删除" as const, title, scope, catName, freq, prob, standard, oldCriteria, typeGroups, reason: `该维度在本日 ${denom} 次 AI 扣分中被 100% 推翻，属整体误扣，建议从${scope}规则中删除该维度。` };
    }
    return { op: "修改" as const, title, scope, catName, freq, prob, standard, oldCriteria, newCriteria: suggestNewCriteria(title, oldCriteria), typeGroups, reason: "高频误扣，建议按客服类型收紧判断标准与不适用边界。" };
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
      { rule: "缺乏耐心", score: "-2", quote: "「您已经问过了，规则页面都写着呢。」", reason: "玩家已明确表示未看懂规则，客服仍以重复引导回应，未进一步解释具体问题。" },
    ],
    aiSuggestion: "建议先确认玩家未理解的具体规则，再用简洁、明确的方式说明充值门槛，并主动提供活动页面入口或截图。",
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
      { rule: "缺乏耐心", score: "-2", quote: "「这个我之前说过了，您再看看活动页面吧。」", reason: "玩家重复追问且已表现出焦急情绪，客服未主动核查或补充说明，回复较为敷衍。" },
      { rule: "安抚不到位", score: "-2", quote: "「好的好的，您稍等。」（玩家明显不满，未作安抚）", reason: "玩家明确表达等待焦虑和不满，客服未回应其情绪，也未说明具体处理进展。" },
    ],
    aiSuggestion: "建议先承接玩家等待未到账的焦虑，主动核查返利进度，并明确告知当前处理状态、预计到账时间和后续跟进方式。",
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
    score: 100,
    chat: [
      { from: "user", text: "请问新手礼包在哪里领？", time: "2024-10-08 09:10:14" },
      { from: "agent", text: "您好，进入游戏后点击右上角「福利」→「新手礼包」即可一键领取，已为您截图标注。", time: "2024-10-08 09:11:02" },
      { from: "user", text: "找到了，谢谢！", time: "2024-10-08 09:12:37" },
    ],
    aiIssues: [],
    aiSuggestion: "建议直接告知新手礼包的领取路径，并确认玩家是否成功领取；如有需要，可同步提供操作截图。",
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
      { rule: "安抚不到位", score: "-2", quote: "「这是系统问题，我这边无法处理。」（随即结束对话）", reason: "玩家反馈充值未到账且资金已扣除，客服未先表达歉意或承接损失焦虑，也未提供明确处理路径。" },
    ],
    aiSuggestion: "建议先对充值未到账和扣款问题表达歉意，说明将核查订单并提交财务工单，同时告知预计反馈时间和后续跟进方式。",
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
  {
    id: "c5",
    agent: "陈静",
    agentType: "高潜客服",
    user: "用户77650391",
    score: 72,
    chat: [
      { from: "user", text: "上次说退款三天到账，现在已经第五天了，再不给结果我就投诉。", time: "2024-10-11 10:38:12" },
      { from: "agent", text: "退款时间以系统处理为准，目前只能继续等待。", time: "2024-10-11 10:39:06" },
      { from: "user", text: "每次都让我等，也没人告诉我到底处理到哪里了。", time: "2024-10-11 10:40:18" },
      { from: "agent", text: "我已经帮您再次提交了，后续请留意到账。", time: "2024-10-11 10:41:02" },
    ],
    aiIssues: [
      { rule: "安抚不到位", score: "-2", quote: "「退款时间以系统处理为准，目前只能继续等待。」", reason: "玩家已明确表示将投诉，客服仍只要求继续等待，未进行情绪安抚或说明升级处理安排。" },
      { rule: "回复不全面", score: "-6", quote: "「我已经帮您再次提交了，后续请留意到账。」", reason: "客服未完整说明退款进度、预计反馈时间和后续查询方式，无法让玩家明确下一步安排。" },
    ],
    aiSuggestion: "建议先回应玩家逾期未退款的焦虑并明确致歉，再同步当前退款进度、专项组跟进情况和下一次反馈时间，避免只让玩家继续等待。",
    history: [
      {
        id: "c5-h1", date: "2024-10-07 16:20:14", demand: "申请活动误充值退款并询问到账时间",
        chat: [
          { from: "user", text: "误充的退款什么时候能到？", time: "2024-10-07 16:20:14" },
          { from: "agent", text: "已提交退款申请，预计三个工作日内到账。", time: "2024-10-07 16:21:08" },
        ],
      },
    ],
    historySummary: {
      handling: { demand: "活动误充值退款", provided: "已提供订单号与支付截图", handled: "已提交退款申请并承诺三个工作日到账", status: "已超过承诺时限，仍未到账" },
      notes: [{ kind: "risk", text: "玩家已连续两次追问退款进度，并明确表示将向平台投诉。" }],
    },
    workOrder: {
      id: "WO-20241011-0836",
      fields: [{ label: "问题类型", value: "退款未到账" }, { label: "原承诺时限", value: "三个工作日" }, { label: "当前进度", value: "等待支付渠道回执" }],
      attachments: ["退款申请记录.png"], uid: "U77650391", status: "已升级", watchers: ["退款专项组"],
      logs: [{ by: "陈静", at: "2024-10-11 10:41:20", text: "玩家已表达投诉倾向，工单升级至退款专项组。" }],
    },
  },
  {
    id: "c6",
    agent: "李梦",
    agentType: "一线客服",
    user: "用户05210488217",
    score: 84,
    chat: [
      { from: "user", text: "我昨天参加的充值返利还没到账，能帮我查一下吗？", time: "2024-10-11 10:59:12" },
      { from: "agent", text: "您好，我先帮您核对订单和活动资格，请稍等。", time: "2024-10-11 11:00:03" },
      { from: "user", text: "已经等了很久了，具体什么时候能有结果？", time: "2024-10-11 11:03:45" },
      { from: "agent", text: "我已经提交核查，结果出来后会同步给您。", time: "2024-10-11 11:04:16" },
    ],
    aiIssues: [
      { rule: "回复不全面", score: "-6", quote: "「我已经提交核查，结果出来后会同步给您。」", reason: "客服虽已提交核查，但未告知工单编号、预计反馈时间和后续查询路径，信息不完整。" },
      { rule: "安抚不到位", score: "-2", quote: "「您好，我先帮您核对订单和活动资格，请稍等。」", reason: "玩家持续追问处理时效，客服未正面回应等待焦虑，也未给出明确的跟进承诺。" },
    ],
    aiSuggestion: "建议先安抚玩家并确认已提交核查，再提供工单编号、预计反馈时间和查询方式；如暂无明确时限，应如实说明并主动跟进。",
  },
  {
    id: "c7",
    agent: "李梦",
    agentType: "一线客服",
    user: "星河旅人",
    score: 79,
    chat: [
      { from: "user", text: "新手礼包和首充礼包可以一起领取吗？", time: "2024-10-11 09:18:06" },
      { from: "agent", text: "您好，两个礼包都可以在福利页面领取，具体以页面提示为准。", time: "2024-10-11 09:18:52" },
      { from: "user", text: "那首充需要充值多少？什么时候过期？", time: "2024-10-11 09:20:10" },
      { from: "agent", text: "首充礼包按活动规则发放，您可以先查看活动说明。", time: "2024-10-11 09:21:04" },
    ],
    aiIssues: [
      { rule: "精准答疑", score: "-5", quote: "「首充礼包按活动规则发放，您可以先查看活动说明。」", reason: "玩家连续提出首充门槛和有效期两个具体问题，客服未直接给出明确答案。" },
    ],
    aiSuggestion: "建议直接查询并说明首充礼包的充值门槛、领取方式和有效期；如果活动版本不同，应先核对当前规则后再回复。",
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
  c1: { agreed: true, submitted: true, objectedRules: [], reran: false, suggestedScore: "", detail: "", agentNote: "AI 初判依据充分，本次维持原判。", deductedRules: ["缺乏耐心"], source: "manual", reviewerName: "王哲", reviewedAt: "2024-10-11 10:24" },
  c3: { agreed: true, submitted: true, objectedRules: [], reran: false, suggestedScore: "", detail: "", agentNote: "", deductedRules: [], source: "manual", reviewerName: "申慧", reviewedAt: "2024-10-11 09:46" },
};

const SEED_AGENT_APPEALS: Record<string, AgentAppealState> = {
  c2: {
    id: "appeal-c2", complaintId: "c2", agent: "王浩", submittedScore: 72,
    objectedRules: ["缺乏耐心"],
    reason: "玩家已两次追问同一问题，我的重复指引属于合理引导，不宜按「缺乏耐心」扣分；但对方情绪明显不满时确实缺少安抚。",
    submittedAt: "2024-10-11 09:38", status: "accepted", baseSource: "ai",
    reviewerScore: 78,
    reviewerOpinion: "复核后确认「缺乏耐心」不成立，客服的重复指引有事实依据；但本场仍缺少明确的到账时效说明。",
    customerMessage: "本次申诉已采纳，已撤销「缺乏耐心」扣分。后续遇到 VIP 玩家等待时，请主动说明处理进度和预计到账时间。",
    reviewerName: "王哲", reviewedAt: "2024-10-11 10:16", seenByAgent: false,
  },
  c4: {
    id: "appeal-c4", complaintId: "c4", agent: "陈静", submittedScore: 61,
    objectedRules: ["安抚不到位"],
    reason: "玩家情绪虽有不满，但我已经如实说明权限范围，「安抚不到位」在本场景属边界情形，我认为不应直接扣分。",
    submittedAt: "2024-10-11 10:48", status: "pending", baseSource: "ai", seenByAgent: true,
  },
  c7: {
    id: "appeal-c7", complaintId: "c7", agent: "李梦", submittedScore: 79,
    objectedRules: ["精准答疑"],
    reason: "我已先确认两个礼包都可以领取，后续关于首充门槛和有效期需要结合当前活动版本查询，想请质检人员核对是否应直接按精准答疑扣分。",
    submittedAt: "2024-10-11 11:12", status: "pending", baseSource: "ai", seenByAgent: true,
  },
};

function reviewFinalScore(complaint: Complaint, review: Review) {
  const suggestedScore = Number(review.suggestedScore);
  return !review.agreed && review.suggestedScore.trim() !== "" && Number.isFinite(suggestedScore)
    ? suggestedScore
    : complaint.score;
}

function issuesFromManualReview(complaint: Complaint, review: Review): AiIssue[] {
  if (review.agreed) return complaint.aiIssues;
  return review.deductedRules.map(rule => complaint.aiIssues.find(item => item.rule === rule) ?? {
    rule,
    score: "人工核定",
    quote: review.agentNote || review.detail || "人工复检确认该项需要扣分。",
  });
}

function deriveEffectiveQualityResults(
  complaints: Complaint[],
  reviews: Record<string, Review>,
  agentAppeals: Record<string, AgentAppealState>
): EffectiveQualityResult[] {
  const manuallyRouted = new Set(HUMAN_REVIEW_QUEUE.map(item => item.complaintId));
  return complaints.map(complaint => {
    const review = reviews[complaint.id];
    const manualCompleted = manuallyRouted.has(complaint.id)
      && !!review
      && review.source === "manual"
      && (review.agreed || review.submitted);
    const manualPending = manuallyRouted.has(complaint.id) && !manualCompleted;
    let baseSource: "ai" | "manual" = "ai";
    let source: "ai" | "manual" | "appeal" = "ai";
    let effectiveScore = complaint.score;
    let effectiveIssues = complaint.aiIssues;

    if (manualCompleted && review) {
      baseSource = "manual";
      source = "manual";
      effectiveScore = reviewFinalScore(complaint, review);
      effectiveIssues = issuesFromManualReview(complaint, review);
    }

    const appeal = agentAppeals[complaint.id];
    let publicationStatus: EffectiveQualityResult["publicationStatus"] = manualPending ? "manualPending" : "published";
    if (!manualPending && appeal?.status === "pending") publicationStatus = "appealPending";
    if (!manualPending && appeal && appeal.status !== "pending") {
      publicationStatus = "resolved";
      source = "appeal";
      if (appeal.status === "accepted") {
        effectiveScore = Number.isFinite(appeal.reviewerScore) ? appeal.reviewerScore! : appeal.submittedScore;
        effectiveIssues = effectiveIssues.filter(item => !appeal.objectedRules.includes(item.rule));
      }
    }

    return {
      complaintId: complaint.id,
      date: "2024-10-11",
      aiScore: complaint.score,
      aiIssues: complaint.aiIssues,
      publicationStatus,
      source,
      baseSource,
      effectiveScore,
      effectiveIssues,
      manualReview: manualCompleted ? review : undefined,
      appeal,
      visibleToAgent: !manualPending,
    };
  });
}

function buildAppealRecords(complaints: Complaint[], agentAppeals: Record<string, AgentAppealState>): AppealRecord[] {
  return Object.values(agentAppeals).flatMap(appeal => {
    const complaint = complaints.find(item => item.id === appeal.complaintId);
    if (!complaint) return [];
    const resolved = appeal.status !== "pending";
    const accepted = appeal.status === "accepted";
    const finalScore = resolved && accepted && Number.isFinite(appeal.reviewerScore)
      ? appeal.reviewerScore!
      : appeal.submittedScore;
    return [{
      id: appeal.id,
      complaintId: complaint.id,
      agent: complaint.agent,
      agentType: complaint.agentType,
      user: complaint.user,
      objectedRules: appeal.objectedRules,
      reason: appeal.reason,
      result: !resolved
        ? "待质检人员复核当前有效结果与客服申诉理由。"
        : accepted
          ? appeal.reviewerOpinion || `采纳申诉，最终得分调整为 ${finalScore} 分。`
          : appeal.reviewerOpinion || `复核后维持原判，最终得分为 ${finalScore} 分。`,
      status: !resolved ? "待处理" : accepted ? "已采纳" : "已驳回",
      reviewer: appeal.reviewerName ?? "待分配",
      reviewedAt: appeal.reviewedAt ?? appeal.submittedAt,
      originalScore: appeal.submittedScore,
      finalScore,
      accepted,
      reviewerOpinion: appeal.reviewerOpinion ?? "",
      customerMessage: appeal.customerMessage ?? "",
    }];
  }).sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
}

const PROTOTYPE_DIM_OPS: DimOp[] = [
  {
    op: "修改", title: "缺乏耐心", scope: "通用", catName: "服务态度", freq: 3, prob: 100,
    standard: "面对反复确认、多轮追问时的语气",
    oldCriteria: "不扣：全程平和认真；-2：明显不耐烦、催促结束、推诿、关闭对话过快。",
    newCriteria: "不扣：全程平和认真，或仅因流程需要多次确认；-2：出现明确不耐烦措辞、催促结束或推诿。不适用：无多轮追问、对话简短平顺。",
    typeGroups: [{ agentTypes: ["一线客服", "VIP一线客服"], hitCount: 3, overturnedCount: 3, prob: 100, oldCriteria: "不扣：全程平和认真；-2：明显不耐烦、催促结束、推诿、关闭对话过快。", newCriteria: "不扣：全程平和认真，或仅因流程需要多次确认；-2：出现明确不耐烦措辞、催促结束或推诿。不适用：无多轮追问、对话简短平顺。" }],
    reason: "本次复审中该维度多次被人工调整，需补充边界，避免把简短但有效的回复误判为不耐心。",
  },
  {
    op: "修改", title: "安抚不到位", scope: "通用", catName: "服务态度", freq: 4, prob: 100,
    standard: "玩家带情绪时是否有针对性安抚",
    oldCriteria: "不扣：有安抚、情绪与事实分开处理；-2：完全未安抚或安抚过于简单敷衍。",
    newCriteria: "不扣：已针对情绪作出回应，或玩家情绪并不强烈；-2：玩家明确表达强烈不满却完全未安抚。不适用：玩家全程情绪平稳、纯咨询。",
    typeGroups: [{ agentTypes: ["AI客服", "一线客服", "VIP一线客服", "专属客服", "高潜客服"], label: "全部客服", hitCount: 4, overturnedCount: 4, prob: 100, oldCriteria: "不扣：有安抚、情绪与事实分开处理；-2：完全未安抚或安抚过于简单敷衍。", newCriteria: "不扣：已针对情绪作出回应，或玩家情绪并不强烈；-2：玩家明确表达强烈不满却完全未安抚。不适用：玩家全程情绪平稳、纯咨询。" }],
    reason: "涉及充值、返利等问题时，事实说明不能替代情绪承接，建议明确‘强烈情绪’的适用边界。",
  },
  {
    op: "修改", title: "精准答疑", scope: "专用", catName: "咨询类", freq: 3, prob: 75,
    standard: "是否直接对应玩家的具体疑问，结论清晰、不堆文案",
    oldCriteria: "不扣：直接命中疑问、结论明确；-2：答了核心但夹带无关文案；-5：答非所问或只复述规则文案。",
    typeGroups: [{ agentTypes: ["专属客服"], hitCount: 4, overturnedCount: 3, prob: 75, oldCriteria: "不扣：直接命中疑问、结论明确；-2：答了核心但夹带无关文案；-5：答非所问或只复述规则文案。", newCriteria: "不扣：直接命中疑问、结论明确，或已如实告知权限外情况、已提交工单/已记录；-2：答了核心但需再追问一次；-5：仅复述文案且无实质回应。" }],
    reason: "人工复审显示‘已查询并如实告知’属于实质回应，建议从标准中明确排除误扣。",
  },
  {
    op: "修改", title: "主动服务与延伸", scope: "专用", catName: "咨询类", freq: 2, prob: 67,
    standard: "是否主动查数据、给出与活动场景相关的延伸建议",
    oldCriteria: "不扣：主动给出建议或主动查了数据；-2：有可延伸点却未提醒。",
    newCriteria: "不扣：主动给出切实建议或查了数据；-2：存在明确可延伸点却未提醒。不适用：一次性规则确认、无后续动作可建议。",
    reason: "应区分确有延伸价值的场景与一次性问答，减少因‘没有额外发挥’产生的机械扣分。",
  },
  {
    op: "修改", title: "回复不全面", scope: "专用", catName: "咨询类", freq: 2, prob: 50,
    standard: "活动细节解释与操作引导是否完整",
    oldCriteria: "-2：活动细节解释不全面、漏答问题或引导不完整。",
    newCriteria: "-2：遗漏玩家明确追问的关键条件、操作步骤或结果说明。不适用：疑问一两句即可讲清、无细节可补。",
    reason: "把‘完整’收敛到玩家明确需要的信息，避免将可选的扩展说明当成必答内容。",
  },
  {
    op: "删除", title: "流程问题", scope: "专用", catName: "咨询类", freq: 2, prob: 100,
    standard: "是否符合本场景处理流程",
    oldCriteria: "-3：处理流程错误或缺失。本场景多为直接答疑，无固定流程。",
    reason: "当前样本中的直接答疑没有统一流程要求，继续保留容易造成无依据扣分，建议整体删除。",
  },
  {
    op: "修改", title: "回复错误", scope: "专用", catName: "咨询类", freq: 1, prob: 25,
    standard: "对活动内容的事实性解答是否正确",
    oldCriteria: "-3：对玩法、活动设置、渠道/版本区分、数据查询等作出事实性错误解答。",
    newCriteria: "-3：明确陈述与真实活动配置、查询结果或渠道事实相矛盾的内容。不适用：如实告知无法查询或权限边界。",
    reason: "事实错误应以可核验信息为依据，不能把无法查询、暂未处理等情况与错误解答混为一谈。",
  },
  {
    op: "新增", title: "响应时效", scope: "通用", catName: "服务态度", freq: 0, prob: 0,
    standard: "客服对玩家消息的响应与跟进是否及时",
    newCriteria: "不扣：全程响应及时、无长时间无回应；-2：出现明显长时间未回应或让玩家反复催促。不适用：玩家未再追问、对话已自然结束。",
    score: "-2",
    reason: "人工复审发现部分低分来自响应与跟进不及时，现有评分维度未覆盖该问题，建议新增。",
  },
];

const PROTOTYPE_PRINCIPLE_OPS: PrincipleOp[] = [
  {
    op: "修改", title: "不适用即不扣",
    oldContent: "只有明确触发规则时才扣分，不符合规则的场景标记为不适用。",
    newContent: "只有明确触发规则且有充分证据时才扣分；边界模糊、缺乏明确扣分依据时，一律从宽判为不适用，不扣分。",
  },
  {
    op: "新增", title: "高频误扣从宽",
    newContent: "对复审中被高频推翻的扣分维度，遇到边界或存疑情形默认不扣，避免同类误扣反复出现。",
  },
];

const SEED_REPORTS: SavedReport[] = [
  {
    id: "seed-report-1", title: "8月25日人工复审报告（V15国识V13）", note: "8月人工复审结果与规则优化建议",
    rangeFrom: "2024-08-25", rangeTo: "2024-08-25", taskNames: ["2024-08-25 人工复审"], ruleVersions: ["v15", "v13"],
    totalScore: 11800, accuracyRate: 88.1, complaintCount: 134, agreedCount: 118, objectionCount: 16,
    dimOps: PROTOTYPE_DIM_OPS, principleOps: PROTOTYPE_PRINCIPLE_OPS,
    status: "done", progress: 100, attempts: 1, createdAt: "2024-08-25 17:35:55", createdBy: "超级管理员", generatedAt: "2024-08-25 17:36:12",
  },
  {
    id: "seed-report-2", title: "8月18日人工复审报告（V14国识V12）", note: "8月第三周复审汇总",
    rangeFrom: "2024-08-18", rangeTo: "2024-08-18", taskNames: ["2024-08-18 人工复审"], ruleVersions: ["v14", "v12"],
    totalScore: 8977, accuracyRate: 91.6, complaintCount: 98, agreedCount: 90, objectionCount: 8,
    dimOps: PROTOTYPE_DIM_OPS, principleOps: PROTOTYPE_PRINCIPLE_OPS,
    status: "done", progress: 100, attempts: 1, createdAt: "2024-08-18 18:12:20", createdBy: "超级管理员", generatedAt: "2024-08-18 18:13:02",
  },
];
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
  pendingFeedback,
  pendingAppeals,
  pendingManualReviews,
  agentAppealBadge,
  onLogout,
}: {
  view: View;
  setView: (view: View) => void;
  currentUser: Account;
  pendingFeedback: number;
  pendingAppeals: number;
  pendingManualReviews: number;
  agentAppealBadge: number;
  onLogout: () => void;
}) {
  const isAgent = currentUser.role === "agent";
  const isAdmin = currentUser.role === "admin";
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
            className={`mb-1 flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "records" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
          >
            <ClipboardCheck className="size-4" />
            我的质检
          </button>
          <button
            onClick={() => setView("agentAppeals")}
            className={`relative mb-1 flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "agentAppeals" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
          >
            <MessageSquareWarning className="size-4" />
            我的申诉
            {agentAppealBadge > 0 && <span className="ml-auto grid min-w-4 place-items-center rounded-full bg-[#e0645f] px-1 text-[9px] font-semibold text-white">{agentAppealBadge}</span>}
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => setView("daily")}
            className={`mb-1 flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "daily" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
          >
            <BarChart3 className="size-4" />
            每日质检
          </button>
          <button
            onClick={() => setView("appeals")}
            className={`relative mb-1 flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "appeals" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
          >
            <MessageSquareWarning className="size-4" />
            处理申诉
            {pendingAppeals > 0 && <span className="ml-auto grid min-w-4 place-items-center rounded-full bg-[#e0645f] px-1 text-[9px] font-semibold text-white">{pendingAppeals}</span>}
          </button>
          <button
            onClick={() => setView("quality")}
            className={`mb-1 flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "quality" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
          >
            <ClipboardCheck className="size-4" />
            待检队列
            {pendingManualReviews > 0 && <span className="ml-auto grid min-w-4 place-items-center rounded-full bg-[#e0645f] px-1 text-[9px] font-semibold text-white">{pendingManualReviews}</span>}
          </button>
          <button
            onClick={() => setView("rules")}
            className={`mb-1 flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "rules" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
          >
            <SlidersHorizontal className="size-4" />
            规则设置
          </button>
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

const DAILY_GROUP_DATA = [
  { group: "一线客服", averageScore: 91.8, complaintCount: 12, issueCount: 3, averageDeduction: 2.4 },
  { group: "VIP一线客服", averageScore: 86.7, complaintCount: 8, issueCount: 2, averageDeduction: 4.1 },
  { group: "高潜客服", averageScore: 79.6, complaintCount: 5, issueCount: 3, averageDeduction: 5.8 },
  { group: "VIP客服", averageScore: 93.2, complaintCount: 3, issueCount: 1, averageDeduction: 1.8 },
];
const DAILY_AGENT_DATA = [
  { group: "一线客服", agent: "李梦", complaintCount: 5, averageScore: 95.2, issueCount: 1, averageDeduction: 1.8 },
  { group: "一线客服", agent: "王晨", complaintCount: 4, averageScore: 90.1, issueCount: 1, averageDeduction: 2.5 },
  { group: "一线客服", agent: "申慧", complaintCount: 3, averageScore: 89.7, issueCount: 1, averageDeduction: 3.1 },
  { group: "VIP一线客服", agent: "王浩", complaintCount: 5, averageScore: 84.2, issueCount: 2, averageDeduction: 4.6 },
  { group: "VIP一线客服", agent: "刘滔", complaintCount: 3, averageScore: 90.8, issueCount: 0, averageDeduction: 3.2 },
  { group: "高潜客服", agent: "陈静", complaintCount: 3, averageScore: 72.6, issueCount: 2, averageDeduction: 8.1 },
  { group: "高潜客服", agent: "罗晶晶", complaintCount: 2, averageScore: 90.1, issueCount: 1, averageDeduction: 2.3 },
  { group: "VIP客服", agent: "王丽君", complaintCount: 2, averageScore: 95.0, issueCount: 0, averageDeduction: 1.1 },
  { group: "VIP客服", agent: "阳尹新", complaintCount: 1, averageScore: 89.5, issueCount: 1, averageDeduction: 3.2 },
];
const TREND_CURRENT_DATE = "2024-10-28";
const TREND_TYPES = ["退款类", "充值类", "咨询类"];
type TrendDailyRecord = { date: string; type: string; complaintCount: number; issueCount: number; event?: string };
type TrendAggregate = { key: string; label: string; complaintCount: number; issueCount: number; issueRate: number; event?: string };
type TrendChartPoint = TrendAggregate;

const TREND_DAILY_SOURCE: TrendDailyRecord[] = Array.from({ length: 90 }, (_, index) => {
  const date = new Date(Date.UTC(2024, 6, 31 + index));
  const dateString = date.toISOString().slice(0, 10);
  return TREND_TYPES.map((type, typeIndex) => {
    const complaintCount = 28 + ((index * 7 + typeIndex * 11) % 18) + (typeIndex === 0 ? 8 : typeIndex === 1 ? 4 : 0);
    const rate = 6.2 + ((index * 5 + typeIndex * 3) % 60) / 10 + (dateString === "2024-10-13" && typeIndex === 0 ? 4.2 : 0);
    return {
      date: dateString,
      type,
      complaintCount,
      issueCount: Math.max(1, Math.round(complaintCount * rate / 100)),
      event: dateString === "2024-10-13" && typeIndex === 0 ? "退款客诉集中" : undefined,
    };
  });
}).flat();

function trendPeriodKey(dateString: string, unit: string) {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (unit === "按日") return dateString;
  if (unit === "按月") return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const monday = new Date(date);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  monday.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return monday.toISOString().slice(0, 10);
}

function trendPeriodLabel(key: string, unit: string) {
  if (unit === "按月") return `${Number(key.slice(5, 7))}月`;
  if (unit === "按周") return `${key.slice(5).replace("-", "/")}周`;
  return key.slice(5).replace("-", "/");
}

function aggregateTrendRecords(records: TrendDailyRecord[], unit: string): TrendAggregate[] {
  const grouped = new Map<string, TrendAggregate>();
  records.forEach(record => {
    const key = trendPeriodKey(record.date, unit);
    const current = grouped.get(key) ?? { key, label: trendPeriodLabel(key, unit), complaintCount: 0, issueCount: 0 };
    current.complaintCount += record.complaintCount;
    current.issueCount += record.issueCount;
    current.event = current.event ?? record.event;
    current.issueRate = current.complaintCount ? current.issueCount / current.complaintCount * 100 : 0;
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function trendPercentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return (current - previous) / previous * 100;
}

function trendFormatChange(value: number) {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}


const DAILY_TRAINING_ISSUES: Record<string, { issue: string; count: number; suggestion: string }[]> = {
  "一线客服": [
    { issue: "缺乏耐心", count: 8, suggestion: "先承接玩家诉求，再给规则入口，避免使用“您已经问过了”等容易引发对立的表达。" },
    { issue: "回复不全面", count: 5, suggestion: "涉及活动门槛时一次性说清条件、操作入口与结果，减少玩家二次追问。" },
    { issue: "安抚不到位", count: 3, suggestion: "遇到充值、返利等高情绪客诉，先明确表达理解，再同步处理进度。" },
  ],
  "VIP一线客服": [
    { issue: "安抚不到位", count: 6, suggestion: "VIP 玩家等待时要明确告知当前进度和预计时间，不只回复“稍等”。" },
    { issue: "主动服务与延伸", count: 4, suggestion: "处理权益类问题时主动核对到账记录，并补充下一步可执行的处理方式。" },
    { issue: "缺乏耐心", count: 2, suggestion: "重复咨询也要保持完整回应，避免让玩家自行反复查找活动页面。" },
  ],
  "高潜客服": [
    { issue: "安抚不到位", count: 7, suggestion: "扣款未到账场景不能只说明权限边界，应同步提交工单并承诺跟进节点。" },
    { issue: "流程问题", count: 4, suggestion: "按照核实订单、提交工单、告知时效、记录反馈的流程闭环处理。" },
    { issue: "回复不全面", count: 3, suggestion: "明确告诉玩家后续找谁、什么时候有结果，避免对话在“无法处理”处结束。" },
  ],
  "VIP客服": [
    { issue: "主动服务与延伸", count: 2, suggestion: "在解决当前问题后，补充相关权益和后续注意事项，形成完整服务。" },
    { issue: "响应时效", count: 1, suggestion: "对需要后台核查的客诉及时报备进度，减少玩家等待期间的重复催问。" },
  ],
};
const DAILY_COMPLAINT_DETAILS = DAILY_AGENT_DATA.flatMap((item, agentIndex) =>
  Array.from({ length: Math.min(item.complaintCount, 4) }, (_, index) => {
    const issue = index < Math.min(item.issueCount, 2) ? DAILY_TRAINING_ISSUES[item.group][index % DAILY_TRAINING_ISSUES[item.group].length] : null;
    const score = issue ? Math.max(68, Math.round(item.averageScore - (index + 1) * 3.5)) : 100;
    return {
      id: `${item.group}-${item.agent}-${index}`,
      sourceComplaintId: item.agent === "李梦" && index === 0
        ? "c1"
        : item.agent === "王浩" && index === 0
          ? "c2"
          : item.agent === "陈静" && index === 0
            ? "c4"
            : item.agent === "陈静" && index === 1
              ? "c5"
              : undefined,
      group: item.group,
      agent: item.agent,
      complaintId: `GD20241011-${String(agentIndex * 4 + index + 12).padStart(4, "0")}`,
      userId: `U${String(103582 + agentIndex * 137 + index * 29).padStart(6, "0")}`,
      score,
      deductions: issue ? [issue.issue] : [],
      deductionDetail: issue ? `${issue.issue}：${issue.suggestion}` : "AI 判定本次会话无扣分项，客服已完整解决玩家诉求。",
      link: `https://aihelp.example.com/complaints/${agentIndex * 4 + index + 12}`,
    };
  })
);

const PLAYER_SENTIMENT_DATA: Record<string, { topic: string; count: number; summary: string; suggestion: string; tone: "warning" | "critical" | "info" }[]> = {
  "2024-10-11": [
    { topic: "退款 / 到账", count: 18, summary: "多名玩家反馈扣款后到账慢，等待期间缺少明确进度。", suggestion: "统一告知核查进度与预计时效，超过时限主动回访。", tone: "critical" },
    { topic: "活动规则", count: 11, summary: "活动门槛和领取条件表述不清，玩家需要反复追问。", suggestion: "优化活动页首屏说明，并补充一问一答式示例。", tone: "warning" },
    { topic: "玩法体验", count: 7, summary: "部分玩家集中吐槽匹配等待时间长、反馈入口不明显。", suggestion: "增加等待状态提示，并在结算页强化问题反馈入口。", tone: "info" },
    { topic: "客服服务", count: 5, summary: "少量玩家提到回复偏模板化，未能直接回应具体诉求。", suggestion: "培训客服先给结论，再补充规则和下一步处理方式。", tone: "warning" },
  ],
};

type SentimentTopic = (typeof PLAYER_SENTIMENT_DATA)[string][number];
function sentimentTopicsForDate(date: string): SentimentTopic[] {
  return PLAYER_SENTIMENT_DATA[date] ?? [];
}

function PlayerSentimentAnalysisPage({ initialDate, onBack }: { initialDate: string; onBack: () => void }) {
  const [date, setDate] = useState(initialDate);
  const topics = sentimentTopicsForDate(date);
  const total = topics.reduce((sum, item) => sum + item.count, 0);
  const topTopic = topics[0];
  const toneClasses = {
    critical: { dot: "bg-[#d75d5d]", chip: "bg-[#fdeceb] text-[#c65050]", border: "border-[#f1d9d9]" },
    warning: { dot: "bg-[#d2862f]", chip: "bg-[#fff3df] text-[#b9791d]", border: "border-[#f0e1c7]" },
    info: { dot: "bg-[#6d95f5]", chip: "bg-[#eef4ff] text-[#4b7ff0]", border: "border-[#dce6f4]" },
  };
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex min-h-[58px] flex-wrap items-center justify-between gap-3 border-b border-[#e2e6eb] bg-white px-5 py-3">
        <div className="flex items-center gap-3"><button onClick={onBack} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]"><ChevronRight className="size-3 rotate-180" />返回每日质检</button><div><h1 className="text-[15px] font-semibold text-[#2f3b48]">玩家舆情分析</h1><p className="mt-0.5 text-[10px] text-[#8b96a3]">AI 汇总当天多个玩家反复反馈的问题</p></div></div>
        <div className="flex items-center gap-2"><span className="text-[10px] text-[#8b97a3]">分析日期</span><input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-7 rounded border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]" /></div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-5"><div className="mx-auto max-w-[1080px] space-y-3">
        {topics.length === 0 ? <div className="rounded-lg border border-dashed border-[#dce6f4] bg-white p-12 text-center text-[11px] text-[#98a3af]">该日期暂无足够的重复反馈，暂不生成舆情报告</div> : <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3"><div className="rounded-lg border border-[#dce6f4] bg-white p-3.5"><div className="text-[10px] text-[#8b97a3]">重复反馈总数</div><div className="mt-1 text-[25px] font-bold leading-none text-[#33465e]">{total}</div><div className="mt-2 text-[10px] text-[#98a3af]">来自多个玩家的相似问题</div></div><div className="rounded-lg border border-[#f0dada] bg-white p-3.5"><div className="text-[10px] text-[#8b97a3]">最高频方向</div><div className="mt-1 text-[20px] font-bold leading-none text-[#d75d5d]">{topTopic.topic}</div><div className="mt-2 text-[10px] text-[#d2862f]">{topTopic.count} 次反馈</div></div><div className="rounded-lg border border-[#dce6f4] bg-white p-3.5"><div className="text-[10px] text-[#8b97a3]">AI 识别方向</div><div className="mt-1 text-[25px] font-bold leading-none text-[#4b7ff0]">{topics.length}</div><div className="mt-2 text-[10px] text-[#98a3af]">玩法、活动与服务等</div></div></div>
          <div className="grid gap-3 xl:grid-cols-[1.02fr_.98fr]">
            <div className="rounded-lg border border-[#e1e6eb] bg-white p-4"><div className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-[#374350]"><BarChart3 className="size-4 text-[#6d95f5]" />问题方向分布</div><div className="mb-2 text-[10px] text-[#8b97a3]">按玩家重复反馈次数排序</div><div className="h-[270px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={topics} layout="vertical" margin={{ top: 8, right: 20, left: 8, bottom: 8 }}><CartesianGrid stroke="#edf1f5" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fill: "#9aa5b1", fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="topic" width={78} tick={{ fill: "#667585", fontSize: 10 }} axisLine={false} tickLine={false} /><RechartsTooltip cursor={{ fill: "#f7faff" }} contentStyle={{ border: "1px solid #dce6f4", borderRadius: 8, fontSize: 11, boxShadow: "0 6px 18px rgba(41,53,66,.12)" }} formatter={(value: number) => [`${value} 次`, "重复反馈"]} /><Bar dataKey="count" name="重复反馈" fill="#6d95f5" radius={[0, 4, 4, 0]} barSize={24} /></BarChart></ResponsiveContainer></div></div>
            <div className="rounded-lg border border-[#e1e6eb] bg-white p-4"><div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[#374350]"><Sparkles className="size-4 text-[#d9a34e]" />AI 舆情报告</div><div className="space-y-2.5">{topics.map(item => { const tone = toneClasses[item.tone]; return <div key={item.topic} className={`rounded-lg border ${tone.border} bg-[#fffdfb] p-3`}><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${tone.dot}`} /><span className="text-[11px] font-semibold text-[#4d5966]">{item.topic}</span><span className={`ml-auto rounded-full px-2 py-0.5 text-[9px] font-medium ${tone.chip}`}>{item.count} 次</span></div><p className="mt-1.5 text-[10px] leading-relaxed text-[#687789]">{item.summary}</p><div className="mt-2 flex gap-1.5 text-[10px] leading-relaxed text-[#5f6f80]"><span className="shrink-0 font-medium text-[#b9791d]">建议</span><span>{item.suggestion}</span></div></div>; })}</div></div>
          </div>
        </>}
      </div></div>
    </div>
  );
}

function scoreTone(score: number) {
  return score >= 90 ? "text-[#27955d]" : score >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]";
}

function AppealProcessingQueue({ onBack, records, onOpen }: { onBack?: () => void; records: AppealRecord[]; onOpen: (complaintId: string) => void }) {
  const [tab, setTab] = useState<"pending" | "processed">("pending");
  const pending = records.filter(item => item.status === "待处理");
  const processed = records.filter(item => item.status !== "待处理");
  const shown = tab === "pending" ? pending : processed;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex min-h-[58px] items-center gap-3 border-b border-[#e2e6eb] bg-white px-5 py-3">{onBack && <button onClick={onBack} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]"><ChevronRight className="size-3 rotate-180" />返回每日质检</button>}<div><h1 className="text-[15px] font-semibold text-[#2f3b48]">处理申诉</h1></div></header>
      <div className="min-h-0 flex-1 overflow-auto p-5"><div className="mx-auto max-w-[900px] space-y-3">
        <div className="rounded-lg border border-[#dce6f4] bg-white p-4"><div className="flex items-center gap-2 text-[12px] font-semibold text-[#374350]"><Inbox className="size-4 text-[#4b7ff0]" />申诉处理队列</div><div className="mt-1 text-[10px] text-[#8b97a3]">逐条复核客服对 AI 判定结果的异议，处理结果会同步更新每日质检看板。</div><div className="mt-3 flex gap-1 rounded-md bg-[#f5f7fa] p-1"><button onClick={() => setTab("pending")} className={`rounded px-3 py-1.5 text-[10px] font-medium ${tab === "pending" ? "bg-white text-[#4b7ff0] shadow-sm" : "text-[#8b97a3]"}`}>待处理 <span className="ml-1 rounded-full bg-[#fff0f0] px-1.5 py-0.5 text-[9px] text-[#d75d5d]">{pending.length}</span></button><button onClick={() => setTab("processed")} className={`rounded px-3 py-1.5 text-[10px] font-medium ${tab === "processed" ? "bg-white text-[#4b7ff0] shadow-sm" : "text-[#8b97a3]"}`}>已处理 <span className="ml-1 rounded-full bg-[#eef4ff] px-1.5 py-0.5 text-[9px] text-[#4b7ff0]">{processed.length}</span></button></div></div>
        {shown.length === 0 ? <div className="rounded-lg border border-dashed border-[#dce6f4] bg-white p-10 text-center text-[11px] text-[#98a3af]">{tab === "pending" ? "当前没有待处理申诉" : "还没有已处理申诉"}</div> : shown.map(item => <article key={item.id} onClick={() => onOpen(item.complaintId)} className="cursor-pointer rounded-lg border border-[#e1e6eb] bg-white p-4 shadow-[0_1px_3px_rgba(41,53,66,.03)] transition hover:border-[#b9cdf3] hover:bg-[#fbfdff] hover:shadow-[0_5px_14px_rgba(75,127,240,.08)]"><div className="flex flex-wrap items-center gap-x-5 gap-y-2"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-[#eef4ff] text-[11px] font-semibold text-[#4b7ff0]">{item.agent.slice(0, 1)}</span><div><div className="text-[11px] font-semibold text-[#465260]">{item.agent} <span className="ml-1 rounded bg-[#f0f4fa] px-1.5 py-0.5 text-[9px] font-normal text-[#687789]">{item.agentType}</span></div><div className="mt-0.5 text-[10px] text-[#8b97a3]">对客诉 {item.complaintId} 的 AI 判定提出异议</div></div></div><div className="ml-auto flex items-center gap-2"><span className="text-[10px] text-[#8b97a3]">{item.status === "待处理" ? "AI 原判" : "核定后总分"} <b className={item.status === "待处理" ? "text-[#d75d5d]" : scoreTone(item.finalScore)}>{item.status === "待处理" ? item.originalScore : item.finalScore} 分</b></span><span className={`rounded-full px-2 py-1 text-[9px] font-medium ${item.status === "待处理" ? "bg-[#fff5e8] text-[#b9791d]" : item.accepted ? "bg-[#eaf7f0] text-[#27955d]" : "bg-[#f0f2f5] text-[#687789]"}`}>{item.status}</span></div></div><div className="mt-3 grid gap-3 md:grid-cols-2"><div className="rounded-md bg-[#f7f9fc] px-3 py-2.5"><div className="text-[9px] text-[#98a3af]">客服申诉理由</div><p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed text-[#687789]">{item.reason}</p></div><div className="rounded-md bg-[#f7f9fc] px-3 py-2.5"><div className="text-[9px] text-[#98a3af]">质检方处理结果</div><p className="mt-1 text-[10px] leading-relaxed text-[#687789]">{item.result}</p></div></div>{item.status !== "待处理" && <div className="mt-2 flex flex-wrap items-center gap-3 text-[9px] text-[#a0acb8]"><span>复核人：{item.reviewer}</span><span>处理时间：{item.reviewedAt}</span><span>最终分数：{item.finalScore} 分</span></div>}{item.status === "待处理" && <div className="mt-3 flex justify-end gap-2 border-t border-[#edf0f3] pt-3"><button onClick={e => { e.stopPropagation(); onOpen(item.complaintId); }} className="rounded-md bg-[#4b7ff0] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#3d6fe0]">进入复核</button></div>}</article>)}
      </div></div>
    </div>
  );
}

function AppealReviewDetail({ complaint, record, onBack, onProcess }: { complaint: Complaint; record: AppealRecord; onBack: () => void; onProcess: (complaintId: string, accepted: boolean, reviewerScore: number, reviewerOpinion: string, customerMessage: string) => void }) {
  const [reviewerOpinion, setReviewerOpinion] = useState(record.reviewerOpinion);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [workOrderOpen, setWorkOrderOpen] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [decision, setDecision] = useState<"accept" | "reject" | null>(null);
  const [reviewerScore, setReviewerScore] = useState(String(record.finalScore ?? complaint.score));
  const [scoreError, setScoreError] = useState("");
  const resolved = record.status !== "待处理";
  const scoreTone = (score: number) => score >= 90 ? "text-[#27955d]" : score >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]";

  function openDecision(nextDecision: "accept" | "reject") {
    setDecision(nextDecision);
    setReviewerOpinion("");
    setScoreError("");
  }

  function submitDecision() {
    if (!decision) return;
    const accepted = decision === "accept";
    const parsedScore = Number(reviewerScore);
    if (accepted && (!Number.isInteger(parsedScore) || parsedScore < 0 || parsedScore > 100)) {
      setScoreError("请输入 0–100 的整数分数");
      return;
    }
    const finalScore = accepted ? parsedScore : complaint.score;
    const message = reviewerOpinion.trim();
    onProcess(record.complaintId, accepted, finalScore, message, message);
    setDecision(null);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f4f6fa]">
      <header className="flex min-h-[60px] items-center gap-3 border-b border-[#e2e6eb] bg-white px-5 py-3">
        <button onClick={onBack} className="flex size-8 items-center justify-center rounded-full border border-[#e0e7f1] bg-white text-[#4b7ff0] transition hover:border-[#c3d6f4] hover:bg-[#eef5ff]"><ChevronRight className="size-4 rotate-180" /></button>
        <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#5a8bf5] to-[#3d6fe0] text-[12px] font-semibold text-white">{complaint.agent.slice(0, 1)}</div>
        <div className="min-w-0"><h1 className="truncate text-[15px] font-semibold text-[#2f3b48]">申诉复核 · {complaint.agent}</h1><p className="mt-0.5 text-[10px] text-[#8b96a3]">客诉 {complaint.id} · 用户 {complaint.user} · 客服类型 {complaint.agentType}</p></div>
        <span className={`ml-auto shrink-0 rounded-full px-2 py-1 text-[9px] font-medium ${record.status === "待处理" ? "bg-[#fff5e8] text-[#b9791d]" : record.accepted ? "bg-[#eaf7f0] text-[#27955d]" : "bg-[#f0f2f5] text-[#687789]"}`}>{record.status}</span>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden px-8 py-5">
        <div className="mx-auto flex min-h-0 w-full max-w-[1680px] gap-5">
          <div className="flex min-h-0 w-[45%] shrink-0 flex-col overflow-hidden rounded-2xl border border-[#e6ecf4] bg-white shadow-[0_6px_24px_-8px_rgba(41,53,66,.12)]">
            <div className="flex items-center gap-2.5 border-b border-[#eef2f7] bg-gradient-to-b from-white to-[#f9fbff] px-4 py-3.5"><div className="flex size-7 items-center justify-center rounded-xl bg-[#eaf1ff] text-[#4b7ff0]"><MessageSquareText className="size-4" /></div><div><div className="text-[12px] font-semibold text-[#333f4c]">客服与用户对话</div><div className="text-[9px] text-[#a3adba]">查看客服申诉所对应的完整客诉记录</div></div><div className="ml-auto flex items-center gap-1.5"><button onClick={() => { setWorkOrderOpen(v => !v); setHistoryOpen(false); }} className={`flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-medium transition ${workOrderOpen ? "bg-[#4b7ff0] text-white" : "border border-[#dbe6f6] bg-white text-[#4b7ff0] hover:bg-[#eef5ff]"}`}><ClipboardCheck className="size-3" />工单</button><button onClick={() => { setHistoryOpen(v => !v); setWorkOrderOpen(false); }} className={`flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-medium transition ${historyOpen ? "bg-[#4b7ff0] text-white" : "border border-[#dbe6f6] bg-white text-[#4b7ff0] hover:bg-[#eef5ff]"}`}><History className="size-3" />历史客诉</button><span className="rounded-full bg-[#f2f5fa] px-2 py-1 text-[9px] text-[#7c8896]">{complaint.chat.length} 条</span></div></div>
            {workOrderOpen && <div className="max-h-[250px] shrink-0 overflow-auto border-b border-[#eef2f7] bg-[#fbfcfe] px-4 py-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#d2dae6]"><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[#333f4c]"><ClipboardCheck className="size-3.5 text-[#4b7ff0]" />客服提交的工单{complaint.workOrder && <span className="font-normal text-[#a3adba]">· {complaint.workOrder.id}</span>}</div>{complaint.workOrder ? <div className="space-y-2 text-[10px] text-[#687789]"><div className="rounded-lg bg-white px-3 py-2.5"><dl className="space-y-1.5">{complaint.workOrder.fields.map((field, index) => <div key={index} className="flex gap-2"><dt className="w-[58px] shrink-0 text-right text-[#98a3af]">{field.label}</dt><dd className="min-w-0 flex-1 break-all text-[#3e4c5a]">{field.value || "—"}</dd></div>)}</dl><div className="mt-2 flex flex-wrap gap-3 border-t border-[#eef1f4] pt-2"><span>UID：{complaint.workOrder.uid || "—"}</span><span>状态：{complaint.workOrder.status || "—"}</span></div></div>{complaint.workOrder.logs && complaint.workOrder.logs.length > 0 && <div className="rounded-lg bg-white px-3 py-2.5"><div className="mb-1.5 text-[#98a3af]">历史记录</div><div className="space-y-1.5">{complaint.workOrder.logs.map((log, index) => <div key={index} className="border-l-2 border-[#dbe6f6] pl-2"><span className="text-[#8b97a3]">{log.by} · {log.at}</span><div className="mt-0.5 break-all text-[#3e4c5a]">{log.text}</div></div>)}</div></div>}</div> : <div className="rounded-lg bg-white px-3 py-4 text-center text-[10px] text-[#a8b2be]">该客诉暂无工单</div>}</div>}
            {historyOpen && <div className="max-h-[300px] shrink-0 overflow-auto border-b border-[#eef2f7] bg-[#fbfcfe] px-4 py-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#d2dae6]"><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[#333f4c]"><History className="size-3.5 text-[#4b7ff0]" />历史客诉记录<span className="font-normal text-[#a3adba]">· {complaint.history?.length ?? 0} 次</span></div>{complaint.history && complaint.history.length > 0 ? <div className="space-y-2">{complaint.history.map((session, index) => <details key={session.id} className="rounded-lg border border-[#e6ecf4] bg-white"><summary className="cursor-pointer list-none px-3 py-2 text-[10px] text-[#687789]"><span className="mr-2 rounded-full bg-[#eef4ff] px-1.5 py-0.5 text-[9px] text-[#4b7ff0]">{index + 1}</span>{session.date}<span className="ml-2 text-[#98a3af]">{session.demand}</span></summary><div className="space-y-2 border-t border-[#eef1f4] px-3 py-2.5">{session.chat.map((message, messageIndex) => <div key={messageIndex} className={`flex ${message.from === "agent" ? "justify-end" : "justify-start"}`}><div className={`max-w-[86%] rounded-lg px-2.5 py-1.5 text-[10px] leading-relaxed ${message.from === "agent" ? "bg-[#eaf2ff] text-[#33465e]" : "bg-[#f2f4f7] text-[#4d5966]"}`}><div className="mb-0.5 text-[9px] text-[#9aa4b0]">{message.from === "agent" ? complaint.agent : "用户"} · {message.time}</div>{message.text}</div></div>)}</div></details>)}</div> : <div className="rounded-lg bg-white px-3 py-4 text-center text-[10px] text-[#a8b2be]">该用户暂无历史客诉记录</div>}{complaint.historySummary && <div className="mt-2 rounded-lg border border-[#dfe8fb] bg-[#eef4ff] px-3 py-2.5 text-[10px] leading-relaxed text-[#5f6b78]"><div className="mb-1 font-medium text-[#3562c8]">玩家历史处理信息</div><div>诉求：{complaint.historySummary.handling.demand}</div><div>已处理：{complaint.historySummary.handling.handled}</div><div>状态：{complaint.historySummary.handling.status}</div></div>}</div>}
            <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-[#fbfcfe] px-4 py-5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#d2dae6]">
              {complaint.chat.map((message, index) => { const isAgent = message.from === "agent"; return <div key={index} className={`flex items-end gap-2 ${isAgent ? "flex-row-reverse" : "flex-row"}`}><div className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-white ${isAgent ? "bg-gradient-to-br from-[#5a8bf5] to-[#3d6fe0] text-white" : "bg-gradient-to-br from-[#eef1f6] to-[#e1e6ee] text-[#697585]"}`}>{isAgent ? "服" : "客"}</div><div className={`flex max-w-[78%] flex-col gap-1 ${isAgent ? "items-end" : "items-start"}`}><span className="px-1 text-[9px] text-[#aab3bf]">{isAgent ? complaint.agent : "用户"} · {message.time}</span><div className={`rounded-[15px] px-3 py-2.5 text-[11px] leading-relaxed ${isAgent ? "rounded-br-[4px] bg-gradient-to-br from-[#5a8bf5] to-[#4577ec] text-white" : "rounded-bl-[4px] border border-[#e8edf4] bg-white text-[#3e4c5a]"}`}>{message.text}</div></div></div>; })}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
            <div className="order-1 shrink-0 rounded-2xl border border-[#eddfc6] bg-[#fffdf8] p-4 shadow-[0_6px_24px_-8px_rgba(88,74,42,.12)]">
              <div className="mb-3 flex items-center gap-2">
                <MessageSquareWarning className="size-4 text-[#d2862f]" />
                <span className="text-[12px] font-semibold text-[#5c6470]">客服申诉理由</span>
              </div>
              <div className="text-[11px] leading-relaxed text-[#5f6b78]">{record.reason}</div>
              <div className="mt-4">
                <button type="button" onClick={() => setAiExpanded(value => !value)} className="flex items-center gap-1 px-0.5 py-1 text-[9px] font-medium text-[#8b6c3d] hover:text-[#6f542d]">
                  {aiExpanded ? "收起 AI 评分明细" : "展开 AI 评分明细"}
                  <ChevronRight className={`size-3 transition-transform ${aiExpanded ? "rotate-90" : ""}`} />
                </button>
                {aiExpanded && (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-[9px] text-[#a28d6d]">AI 判定分数</div>
                        <div className={`mt-1 text-[23px] font-bold leading-none ${scoreTone(complaint.score)}`}>
                          {complaint.score}<span className="ml-1 text-[10px] font-normal text-[#a8b2be]">分</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-[#a28d6d]">以下为 AI 扣分规则与原始对话依据</div>
                    </div>
                    {complaint.aiIssues.length === 0 ? (
                      <div className="text-[10px] text-[#27955d]">本次会话无扣分项，AI 判定表现良好。</div>
                    ) : (
                      <div className="space-y-2">
                        {complaint.aiIssues.map((issue, index) => (
                          <div key={index} className="rounded-lg bg-[#fff8f5] px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-semibold text-[#d1544f]">{issue.rule}</span>
                              <span className="text-[10px] font-bold text-[#d1544f]">{issue.score}</span>
                            </div>
                            <div className="mt-1 text-[9px] text-[#a28d6d]">原始对话依据</div>
                            <div className="mt-0.5 text-[10px] italic leading-relaxed text-[#8b97a4]">{issue.quote}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {resolved ? (
                <div className="mt-5">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold text-[#5c6470]">处理结果</div>
                    <span className={`rounded-full px-2 py-1 text-[9px] font-medium ${record.accepted ? "bg-[#eaf7f0] text-[#27955d]" : "bg-[#f5f7fa] text-[#687789]"}`}>
                      {record.accepted ? "已同意" : "已驳回"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[9px] text-[#8b97a4]">
                    <span>复核人：{record.reviewer}</span>
                    <span>处理时间：{record.reviewedAt}</span>
                    <span>最终分数：{record.finalScore} 分</span>
                  </div>
                  <div className="mt-2 text-[10px] leading-relaxed text-[#687789]"><span className="font-medium text-[#8b97a3]">给客服的复核意见：</span>{reviewerOpinion || "未填写"}</div>
                </div>
              ) : (
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => openDecision("reject")} className="rounded-lg border border-[#d9e2ee] bg-white px-4 py-2 text-[10px] font-medium text-[#687789] hover:border-[#b8c8dc]">驳回</button>
                  <button type="button" onClick={() => openDecision("accept")} className="rounded-lg bg-[#4b7ff0] px-4 py-2 text-[10px] font-medium text-white hover:bg-[#3d6fe0]">同意</button>
                </div>
              )}
            </div>
            {decision && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#233044]/25 px-5" onClick={() => setDecision(null)}>
                <div className="w-full max-w-[460px] rounded-2xl bg-white p-5 shadow-[0_18px_60px_rgba(35,48,68,.2)]" onClick={event => event.stopPropagation()}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[14px] font-semibold text-[#333f4c]">{decision === "accept" ? "同意申诉" : "驳回申诉"}</div>
                      <div className="mt-1 text-[10px] text-[#8b97a3]">{decision === "accept" ? "确认客服应得分数，并填写需要同步给客服的说明。" : "填写希望告知客服的复核意见，提交后将完成本次处理。"}</div>
                    </div>
                    <button type="button" onClick={() => setDecision(null)} className="flex size-7 items-center justify-center rounded-full text-[18px] leading-none text-[#9aa5b2] hover:bg-[#f4f6fa] hover:text-[#687789]">×</button>
                  </div>
                  {decision === "accept" && (
                    <label className="mt-5 block">
                      <span className="mb-1.5 block text-[10px] font-medium text-[#5f6b78]">客服应得分数</span>
                      <div className="flex items-center gap-2">
                        <input type="number" min="0" max="100" step="1" value={reviewerScore} onChange={event => { setReviewerScore(event.target.value); setScoreError(""); }} autoFocus className="h-9 w-[120px] rounded-lg border border-[#dbe3ee] bg-white px-3 text-right text-[15px] font-semibold text-[#33465e] outline-none focus:border-[#4b7ff0]" />
                        <span className="text-[10px] text-[#98a3af]">0–100 分</span>
                      </div>
                      {scoreError && <div className="mt-1.5 text-[10px] text-[#d75d5d]">{scoreError}</div>}
                    </label>
                  )}
                  <label className="mt-4 block">
                    <span className="mb-1.5 block text-[10px] font-medium text-[#5f6b78]">给客服的复核意见 <span className="font-normal text-[#a3adba]">（可选）</span></span>
                    <textarea value={reviewerOpinion} onChange={event => setReviewerOpinion(event.target.value)} rows={4} placeholder={decision === "accept" ? "可选：说明最终分数及后续建议" : "可选：填写想对客服说明的话"} autoFocus={decision === "reject"} className="w-full resize-none rounded-xl border border-[#dbe3ee] bg-[#fafbfd] px-3 py-2.5 text-[11px] leading-relaxed text-[#3e4c5a] outline-none transition focus:border-[#4b7ff0] focus:bg-white" />
                  </label>
                  <div className="mt-5 flex justify-end gap-2">
                    <button type="button" onClick={() => setDecision(null)} className="rounded-lg border border-[#d9e2ee] bg-white px-4 py-2 text-[10px] font-medium text-[#687789] hover:border-[#b8c8dc]">取消</button>
                    <button type="button" onClick={submitDecision} className={`rounded-lg px-4 py-2 text-[10px] font-medium text-white ${decision === "accept" ? "bg-[#4b7ff0] hover:bg-[#3d6fe0]" : "bg-[#687789] hover:bg-[#58697c]"}`}>{decision === "accept" ? "确认同意" : "提交驳回"}</button>
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

function AppealProcessingPage({ onBack, records, complaints, onProcess }: { onBack?: () => void; records: AppealRecord[]; complaints: Complaint[]; onProcess: (complaintId: string, accepted: boolean, reviewerScore: number, reviewerOpinion: string, customerMessage: string) => void }) {
  const [openComplaintId, setOpenComplaintId] = useState<string | null>(null);
  const record = openComplaintId ? records.find(item => item.complaintId === openComplaintId) ?? null : null;
  const complaint = record ? complaints.find(item => item.id === record.complaintId) ?? null : null;
  if (record && complaint) return <AppealReviewDetail complaint={complaint} record={record} onBack={() => setOpenComplaintId(null)} onProcess={onProcess} />;
  return <AppealProcessingQueue onBack={onBack} records={records} onOpen={setOpenComplaintId} />;
}

function AppealRecordsPage({ onBack, records }: { onBack: () => void; records: AppealRecord[] }) {
  const acceptedCount = records.filter(item => item.accepted).length;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex min-h-[58px] items-center gap-3 border-b border-[#e2e6eb] bg-white px-5 py-3"><button onClick={onBack} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]"><ChevronRight className="size-3 rotate-180" />返回每日质检</button><div><h1 className="text-[15px] font-semibold text-[#2f3b48]">客服申诉记录</h1></div></header>
      <div className="min-h-0 flex-1 overflow-auto p-5"><div className="mx-auto max-w-[1080px] space-y-3">
        <div className="grid grid-cols-2 gap-3"><div className="rounded-lg border border-[#dce6f4] bg-white p-3.5"><div className="text-[10px] text-[#8b97a3]">当天申诉记录</div><div className="mt-1 text-[24px] font-bold text-[#33465e]">{records.length}</div></div><div className="rounded-lg border border-[#dce6f4] bg-white p-3.5"><div className="text-[10px] text-[#8b97a3]">质检认可申诉</div><div className="mt-1 text-[24px] font-bold text-[#27955d]">{acceptedCount}</div></div></div>
        <div className="overflow-hidden rounded-lg border border-[#e1e6eb] bg-white"><div className="flex items-center justify-between border-b border-[#e9edf0] px-4 py-3"><div><div className="flex items-center gap-2 text-[12px] font-semibold text-[#374350]"><MessageSquareWarning className="size-4 text-[#d2862f]" />全部申诉记录</div><div className="mt-0.5 text-[10px] text-[#8b97a3]">记录客服对 AI 判理结果存疑的客诉，以及质检方的最终处理结果</div></div><span className="text-[10px] text-[#a0acb8]">2024-10-11</span></div><div className="space-y-2 p-3">{records.map(item => <article key={item.id} className="rounded-lg border border-[#edf0f3] bg-[#fcfdff] p-3.5 transition hover:border-[#cbdaf5] hover:bg-[#f8fbff]"><div className="flex flex-wrap items-center gap-x-5 gap-y-2"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-full bg-[#eef4ff] text-[11px] font-semibold text-[#4b7ff0]">{item.agent.slice(0, 1)}</span><div><div className="text-[11px] font-semibold text-[#465260]">{item.agent}</div><div className="text-[9px] text-[#98a3af]">{item.agentType}</div></div></div><div className="text-[10px]"><span className="mr-1.5 text-[#98a3af]">客诉</span><span className="font-medium text-[#465260]">{item.complaintId}</span></div><div className="text-[10px]"><span className="mr-1.5 text-[#98a3af]">用户</span><span className="text-[#687789]">{item.user}</span></div><div className="text-[10px]"><span className="mr-1.5 text-[#98a3af]">争议项</span><span className="rounded bg-[#fff0f0] px-1.5 py-1 text-[9px] text-[#d75d5d]">{item.objectedRules.join("、")}</span></div><span className={`ml-auto rounded-full px-2 py-1 text-[9px] font-medium ${item.accepted ? "bg-[#eaf7f0] text-[#27955d]" : "bg-[#f0f2f5] text-[#687789]"}`}>{item.status}</span></div><div className="mt-3 grid gap-2 md:grid-cols-2"><div className="rounded-md bg-[#f7f9fc] px-3 py-2.5"><div className="text-[9px] text-[#98a3af]">客服申诉理由</div><p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed text-[#687789]">{item.reason}</p></div><div className="rounded-md bg-[#f7f9fc] px-3 py-2.5"><div className="text-[9px] text-[#98a3af]">质检方处理结果</div><p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed text-[#687789]">{item.result}</p></div></div><div className="mt-2 flex flex-wrap items-center gap-3 text-[9px] text-[#a0acb8]"><span>AI 原判 {item.originalScore} 分</span><span>最终 {item.finalScore} 分</span><span>复核人：{item.reviewer}</span><span>处理时间：{item.reviewedAt}</span></div></article>)}</div></div>
      </div></div>
    </div>
  );
}

function TrendAnalysisPage({ initialDate, onBack, appealRecords, effectiveResults }: { initialDate: string; onBack: () => void; appealRecords: AppealRecord[]; effectiveResults: EffectiveQualityResult[] }) {
  const unit = "按日";
  const issueCountCorrection = effectiveResults.reduce((sum, result) =>
    sum + Number(result.effectiveScore < 100) - Number(result.aiScore < 100), 0);
  const adjustedTrendSource = TREND_DAILY_SOURCE.map(record => record.date === initialDate && record.type === TREND_TYPES[0]
    ? { ...record, issueCount: Math.max(0, record.issueCount + issueCountCorrection) }
    : record);
  const currentDate = new Date(`${initialDate}T00:00:00Z`);
  const rangeStart = new Date(currentDate);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 15 + 1);
  const source = adjustedTrendSource.filter(record =>
    record.date >= rangeStart.toISOString().slice(0, 10) && record.date <= initialDate
  );
  const trendAggregates = aggregateTrendRecords(source, unit);
  const allAggregates = aggregateTrendRecords(
    adjustedTrendSource.filter(record => record.date <= initialDate),
    unit
  );
  const currentKey = trendPeriodKey(initialDate, unit);
  const previousDate = new Date(currentDate);
  if (unit === "按日") previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  else if (unit === "按周") previousDate.setUTCDate(previousDate.getUTCDate() - 7);
  else previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
  const previousKey = trendPeriodKey(previousDate.toISOString().slice(0, 10), unit);
  const emptyAggregate = (key: string): TrendAggregate => ({ key, label: trendPeriodLabel(key, unit), complaintCount: 0, issueCount: 0, issueRate: 0 });
  const currentSummary = allAggregates.find(item => item.key === currentKey) ?? emptyAggregate(currentKey);
  const previousSummary = allAggregates.find(item => item.key === previousKey) ?? emptyAggregate(previousKey);
  const complaintChange = trendPercentChange(currentSummary.complaintCount, previousSummary.complaintCount);
  const issueRateChange = trendPercentChange(currentSummary.issueRate, previousSummary.issueRate);
  const trendData: TrendChartPoint[] = trendAggregates;
  const trainingRecommendations = Object.entries(DAILY_TRAINING_ISSUES)
    .flatMap(([group, issues]) => issues.map(item => ({ ...item, group })))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  const peakPoint = trendData.reduce((peak, item) => item.issueRate > peak.issueRate ? item : peak, trendData[0] ?? emptyAggregate(currentKey));
  const changeDisplay = (value: number) => value === 0 ? "持平 0.0%" : `${value > 0 ? "↑" : "↓"} ${Math.abs(value).toFixed(1)}%`;
  const issueRateImproved = issueRateChange <= 0;
  const tooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ payload?: TrendChartPoint }>; label?: string }) => {
    const point = payload?.[0]?.payload;
    if (!active || !point) return null;
    return <div className="rounded-lg border border-[#dce6f4] bg-white px-3 py-2 text-[10px] shadow-[0_6px_18px_rgba(41,53,66,.12)]"><div className="mb-1 font-semibold text-[#465260]">{label}</div><div className="space-y-1 text-[#687789]"><div className="flex justify-between gap-6"><span>客诉处理量</span><strong className="text-[#536a89]">{point.complaintCount} 条</strong></div><div className="flex justify-between gap-6"><span>问题客诉数</span><strong className="text-[#d2862f]">{point.issueCount} 条</strong></div><div className="flex justify-between gap-6"><span>客诉问题率</span><strong className="text-[#687ff0]">{point.issueRate.toFixed(1)}%</strong></div>{point.event && <div className="border-t border-[#edf1f5] pt-1 text-[#b9791d]">事件：{point.event}</div>}</div></div>;
  };
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex min-h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5 py-3">
        <div className="flex items-center gap-3"><button onClick={onBack} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]"><ChevronRight className="size-3 rotate-180" />返回每日质检</button><div><h1 className="text-[15px] font-semibold text-[#2f3b48]">质量洞察</h1></div></div>
        <div />
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-5"><div className="mx-auto max-w-[1080px] space-y-3">
        <div className="rounded-lg border border-[#dce6f4] bg-white p-4 shadow-[0_1px_3px_rgba(41,53,66,.03)]">
          <div className="flex flex-wrap items-start gap-3"><div className="flex items-center gap-5"><div><div className="text-[11px] font-medium text-[#687789]">客诉处理量</div><div className="mt-1 flex items-baseline gap-2"><span className="text-[24px] font-bold text-[#33465e]">{currentSummary.complaintCount.toLocaleString()}</span><span className={`text-[10px] font-medium ${complaintChange >= 0 ? "text-[#27955d]" : "text-[#d2862f]"}`}>{changeDisplay(complaintChange)}</span></div><div className={`text-[9px] ${complaintChange >= 0 ? "text-[#27955d]" : "text-[#d2862f]"}`}>较上一周期</div></div><div className="h-9 w-px bg-[#edf1f5]" /><div><div className="text-[11px] font-medium text-[#687789]">客诉问题率</div><div className="mt-1 flex items-baseline gap-2"><span className="text-[24px] font-bold text-[#33465e]">{currentSummary.issueRate.toFixed(1)}%</span><span className={`text-[10px] font-medium ${issueRateImproved ? "text-[#27955d]" : "text-[#d75d5d]"}`}>{changeDisplay(issueRateChange)}</span></div><div className={`text-[9px] ${issueRateImproved ? "text-[#27955d]" : "text-[#d75d5d]"}`}>{issueRateImproved ? "较上一周期改善" : "较上一周期需关注"}</div></div></div></div>
          <div className="mt-3 space-y-3">
            <div><div className="mb-1 flex items-center gap-2 text-[10px] font-medium text-[#687789]"><span className="size-2 rounded-full bg-[#687ff0]" />客诉数量趋势 <span className="font-normal text-[#a0acb8]">（条）</span></div><div className="h-[220px]"><ResponsiveContainer width="100%" height="100%"><RechartsLineChart data={trendData} margin={{ top: 24, right: 12, left: -12, bottom: 0 }}><defs><linearGradient id="complaintArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#718df1" stopOpacity={0.22} /><stop offset="100%" stopColor="#718df1" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="#edf1f5" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#9aa5b1", fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "#9aa5b1", fontSize: 9 }} axisLine={false} tickLine={false} /><RechartsTooltip cursor={{ stroke: "#b8c9ec", strokeDasharray: "4 4" }} content={tooltip} /><Legend iconType="circle" wrapperStyle={{ fontSize: 10, color: "#687789" }} /><Area type="monotone" dataKey="complaintCount" name="客诉处理量" stroke="none" fill="url(#complaintArea)" /><RechartsLine type="monotone" dataKey="issueCount" name="问题客诉数" stroke="#d98a35" strokeWidth={2} dot={{ r: 3, fill: "#d98a35", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} /><RechartsLine type="monotone" dataKey="complaintCount" name="客诉处理量" stroke="#687ff0" strokeWidth={2.5} dot={{ r: 3.5, fill: "#687ff0", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} />{trendData.filter(item => item.event).map(item => <ReferenceDot key={item.key} x={item.label} y={item.complaintCount} r={4} fill="#d9a34e" stroke="#fff" strokeWidth={2}><Label value={item.event} position="top" fill="#b9791d" fontSize={9} /></ReferenceDot>)}</RechartsLineChart></ResponsiveContainer></div></div>
            <div><div className="mb-1 flex items-center gap-2 text-[10px] font-medium text-[#687789]"><span className="size-2 rounded-full bg-[#55a58b]" />客诉问题率趋势 <span className="font-normal text-[#a0acb8]">（%）</span></div><div className="h-[150px]"><ResponsiveContainer width="100%" height="100%"><RechartsLineChart data={trendData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}><CartesianGrid stroke="#edf1f5" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#9aa5b1", fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis domain={[0, "auto"]} tick={{ fill: "#9aa5b1", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => `${value}%`} /><RechartsTooltip cursor={{ stroke: "#b8c9ec", strokeDasharray: "4 4" }} content={tooltip} /><RechartsLine type="monotone" dataKey="issueRate" name="客诉问题率" stroke="#55a58b" strokeWidth={2.5} dot={{ r: 3.5, fill: "#55a58b", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} /></RechartsLineChart></ResponsiveContainer></div></div>
          </div>
        </div>
        <div className="relative z-10 -mt-1 border-l-2 border-[#e7c888] px-4 py-3.5"><div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[#5c6470]"><Sparkles className="size-4 text-[#d9a34e]" />趋势解读</div><div className="grid gap-3 md:grid-cols-2"><div><span className="text-[10px] text-[#a28d6d]">整体趋势</span><p className="mt-1 text-[11px] leading-relaxed text-[#5f6b78]">问题率较上一周期{issueRateImproved ? "下降" : "上升"}{Math.abs(issueRateChange).toFixed(1)}%，{issueRateImproved ? "当前周期持续改善" : "当前周期需要重点关注"}</p></div><div><span className="text-[10px] text-[#a28d6d]">重点关注</span><p className="mt-1 text-[11px] leading-relaxed text-[#5f6b78]">{peakPoint.label}问题率达到{peakPoint.issueRate.toFixed(1)}%，为当前筛选范围内峰值</p></div><div><span className="text-[10px] text-[#a28d6d]">主要原因</span><p className="mt-1 text-[11px] leading-relaxed text-[#5f6b78]">{peakPoint.event ?? "波动主要来自退款未到账类客诉集中增加"}</p></div><div><span className="text-[10px] text-[#a28d6d]">行动建议</span><p className="mt-1 text-[11px] leading-relaxed text-[#5f6b78]">建议针对{issueRateImproved ? "峰值周期的异常工单" : "当前周期的高风险工单"}开展人工必检</p></div></div></div>
        <div className="border-t border-[#e8dfcf] pt-4"><div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[#5c6470]"><Sparkles className="size-4 text-[#d9a34e]" />质培指导意见</div><div className="grid gap-2 md:grid-cols-2">{trainingRecommendations.map((item, index) => <article key={`${item.group}-${item.issue}`} className="py-1"><div className="flex items-center gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#f5dfbd] text-[9px] font-semibold text-[#b9791d]">{index + 1}</span><div className="min-w-0"><div className="text-[11px] font-semibold text-[#5b6572]">{item.issue}</div><div className="mt-0.5 text-[9px] text-[#a28d6d]">{item.group} · 高频扣分项</div></div><span className="ml-auto shrink-0 rounded-full bg-[#f7ead6] px-2 py-0.5 text-[9px] font-medium text-[#b9791d]">{item.count} 次</span></div><p className="mt-2 pl-7 text-[10px] leading-relaxed text-[#687789]">{item.suggestion}</p></article>)}</div><div className="mt-3 border-l-2 border-[#e7c888] pl-3 text-[10px] leading-relaxed text-[#8b7a63]">建议将以上问题纳入本周期质培复盘，并结合关联客诉逐条确认客服是否完成了有效承接、准确回复与闭环跟进。</div></div>
      </div></div>
    </div>
  );
}

function AIQualityRecordsPage({ initialDate, onBack, complaints, effectiveResults }: { initialDate: string; onBack: () => void; complaints: Complaint[]; effectiveResults: EffectiveQualityResult[] }) {
  const [activeGroup, setActiveGroup] = useState("全部分组");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const currentDashboardDate = "2024-10-11";
  const isCurrentDate = initialDate === currentDashboardDate;
  const historyDay = Number(initialDate.slice(-2));
  const groups = ["全部分组", ...DAILY_GROUP_DATA.map(item => item.group)];
  const corrections = new Map<string, { scoreDelta: number; issueDelta: number; deductionDelta: number }>();
  const addCorrection = (agent: string, originalScore: number, finalScore: number) => {
    const current = corrections.get(agent) ?? { scoreDelta: 0, issueDelta: 0, deductionDelta: 0 };
    current.scoreDelta += finalScore - originalScore;
    current.issueDelta += Number(finalScore < 100) - Number(originalScore < 100);
    current.deductionDelta += originalScore - finalScore;
    corrections.set(agent, current);
  };
  if (isCurrentDate) effectiveResults.forEach(result => {
    const complaint = complaints.find(item => item.id === result.complaintId);
    if (complaint) addCorrection(complaint.agent, result.aiScore, result.effectiveScore);
  });
  const agentData = DAILY_AGENT_DATA.map((item, index) => {
    const correction = corrections.get(item.agent) ?? { scoreDelta: 0, issueDelta: 0, deductionDelta: 0 };
    const scoreDelta = isCurrentDate ? 0 : (((historyDay * 3 + index * 2) % 7) - 3) * 0.7;
    const issueDelta = isCurrentDate ? 0 : ((historyDay + index) % 3) - 1;
    const deductionDelta = isCurrentDate ? 0 : (((historyDay + index * 3) % 5) - 2) * 0.35;
    return {
      ...item,
      issueCount: Math.max(0, Math.min(item.complaintCount, item.issueCount + correction.issueDelta + issueDelta)),
      averageScore: Number(Math.max(0, Math.min(100, item.averageScore + correction.scoreDelta / item.complaintCount + scoreDelta)).toFixed(1)),
      averageDeduction: Number(Math.max(0, item.averageDeduction + correction.deductionDelta / item.complaintCount + deductionDelta).toFixed(1)),
    };
  });
  const isAllGroups = activeGroup === "全部分组";
  const visibleAgents = isAllGroups ? agentData : agentData.filter(item => item.group === activeGroup);
  const effectiveByComplaintId = new Map<string, EffectiveQualityResult>(isCurrentDate ? effectiveResults.map(item => [item.complaintId, item]) : []);
  const details = DAILY_COMPLAINT_DETAILS
    .map(item => {
      const result = item.sourceComplaintId ? effectiveByComplaintId.get(item.sourceComplaintId) : undefined;
      if (!result || result.publicationStatus === "manualPending") return item;
      return {
        ...item,
        score: result.effectiveScore,
        deductions: result.effectiveIssues.map(issue => issue.rule),
        deductionDetail: result.source === "appeal"
          ? `申诉复核已完成，当前最新有效得分为 ${result.effectiveScore} 分。`
          : result.source === "manual"
            ? `人工核定：${result.manualReview?.agentNote || result.manualReview?.detail || `最终得分为 ${result.effectiveScore} 分。`}`
            : item.deductionDetail,
      };
    })
    .filter(item => isAllGroups || item.group === activeGroup)
    .filter(item => !selectedAgent || item.agent === selectedAgent)
    .sort((a, b) => Number(a.score === 100) - Number(b.score === 100) || a.score - b.score);
  const datedDetails = details.map((item, index) => {
    if (isCurrentDate) return item;
    const dateKey = initialDate.replaceAll("-", "");
    const scoreDelta = ((historyDay + index * 2) % 7) - 3;
    return { ...item, id: `${initialDate}-${item.id}`, complaintId: `GD${dateKey}-${String(index + 1).padStart(4, "0")}`, score: Math.max(60, Math.min(100, item.score + scoreDelta)), sourceComplaintId: undefined, link: `https://quality.internal/complaints/${dateKey}-${String(index + 1).padStart(4, "0")}` };
  });
  const activeAgent = selectedAgent ? agentData.find(item => item.agent === selectedAgent) ?? null : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex min-h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5 py-3">
        <div className="flex items-center gap-3"><button type="button" onClick={onBack} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]"><ChevronRight className="size-3 rotate-180" />返回每日质检</button><div><h1 className="text-[15px] font-semibold text-[#2f3b48]">AI质检客诉记录</h1><p className="mt-0.5 text-[10px] text-[#8b96a3]">{initialDate} · AI 结果生成后即可查看，不受人工复检状态影响</p></div></div>
        <span className="rounded-full bg-[#eef4ff] px-2.5 py-1 text-[9px] font-medium text-[#4b7ff0]">AI 已完成</span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-[1180px] space-y-3">
          <div className="flex items-center gap-2 overflow-x-auto px-1 py-2"><span className="mr-1 shrink-0 text-[10px] font-medium text-[#687789]">分组筛选</span>{groups.map(group => <button key={group} type="button" onClick={() => { setActiveGroup(group); setSelectedAgent(null); }} className={`shrink-0 rounded-md px-2.5 py-1.5 text-[10px] transition ${activeGroup === group ? "bg-[#eaf2ff] font-medium text-[#3562c8]" : "text-[#8b97a3] hover:bg-[#f3f6fa] hover:text-[#5a6572]"}`}>{group}</button>)}</div>
          <div className="overflow-hidden rounded-lg border border-[#e1e6eb] bg-white">
            {selectedAgent ? (
              <>
                <div className="flex items-center gap-3 border-b border-[#e9edf0] px-4 py-3"><button type="button" onClick={() => setSelectedAgent(null)} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]"><ChevronRight className="size-3 rotate-180" />返回客服列表</button><div><div className="text-[12px] font-semibold text-[#374350]">{selectedAgent} · AI客诉判分明细</div><div className="mt-0.5 text-[10px] text-[#8b97a3]">{activeAgent?.group} · {initialDate} · 非满分客诉优先展示</div></div></div>
                <div className="overflow-x-auto"><div className="min-w-[1120px]"><div className="grid grid-cols-[150px_120px_74px_150px_1fr_260px] bg-[#fafbfc] px-4 py-2 text-[10px] text-[#8b97a3]"><span>客诉 ID</span><span>用户 ID</span><span>总分</span><span>扣分项</span><span>扣分明细</span><span>客诉链接</span></div>{datedDetails.map(item => <div key={item.id} className="grid grid-cols-[150px_120px_74px_150px_1fr_260px] items-start border-t border-[#edf0f3] px-4 py-3 text-[10px] transition hover:bg-[#f8fbff]"><span className="font-medium text-[#465260]">{item.complaintId}</span><span className="text-[#687789]">{item.userId}</span><span className={`text-[14px] font-bold ${scoreTone(item.score)}`}>{item.score}</span><span>{item.deductions.length ? <span className="inline-flex rounded bg-[#fff0f0] px-1.5 py-1 text-[9px] text-[#d75d5d]">{item.deductions.join("、")}</span> : <span className="text-[#98a3af]">无扣分</span>}</span><span className="pr-4 leading-relaxed text-[#687789]">{item.deductionDetail}</span><a href={item.link} target="_blank" rel="noreferrer" className="break-all pr-5 leading-relaxed text-[#4b7ff0] hover:underline" title={item.link}>{item.link}</a></div>)}</div></div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-[#e9edf0] px-4 py-3"><div><div className="text-[12px] font-semibold text-[#374350]">AI质检客诉记录</div><div className="mt-0.5 text-[10px] text-[#8b97a3]">{initialDate} · 当前展示 {visibleAgents.length} 位客服 · 点击客服查看客诉判分列表</div></div><span className="text-[10px] text-[#a0acb8]">非满分客诉优先</span></div>
                <div className="overflow-x-auto"><div className="min-w-[660px]"><div className="grid grid-cols-[130px_150px_90px_90px_90px_110px] bg-[#fafbfc] px-4 py-2 text-[10px] text-[#8b97a3]"><span>客服分组</span><span>客服</span><span>处理客诉</span><span>平均分</span><span>问题数</span><span>平均扣分</span></div>{visibleAgents.map(item => <button key={`${item.group}-${item.agent}`} type="button" onClick={() => setSelectedAgent(item.agent)} className="grid w-full grid-cols-[130px_150px_90px_90px_90px_110px] items-center border-t border-[#edf0f3] px-4 py-2.5 text-left text-[11px] transition hover:bg-[#f8fbff]"><span><span className="rounded bg-[#f0f4fa] px-1.5 py-1 text-[10px] text-[#687789]">{item.group}</span></span><span className="flex items-center gap-2 font-medium text-[#465260]"><span className="grid size-6 place-items-center rounded-full bg-[#eaf2ff] text-[10px] font-semibold text-[#4b7ff0]">{item.agent.slice(0, 1)}</span>{item.agent}<ChevronRight className="ml-auto size-3.5 text-[#b0bbc8]" /></span><span className="text-[#5f6f80]">{item.complaintCount} 条</span><span className={`font-semibold ${scoreTone(item.averageScore)}`}>{item.averageScore}</span><span className={item.issueCount > 0 ? "font-medium text-[#d2862f]" : "text-[#98a3af]"}>{item.issueCount} 个</span><span className="text-[#536a89]">{item.averageDeduction} 分</span></button>)}</div></div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DailyQualityDashboard({ onOpenTrend, onOpenAppeals, onOpenManualReviews, onOpenRecords, onOpenSentiment, appealRecords, complaints, reviews, effectiveResults, dashboardUpdateNotice, dashboardLastUpdatedAt, onConsumeDashboardUpdate }: { onOpenTrend: (date: string) => void; onOpenAppeals: () => void; onOpenManualReviews: () => void; onOpenRecords: (date: string) => void; onOpenSentiment: (date: string) => void; appealRecords: AppealRecord[]; complaints: Complaint[]; reviews: Record<string, Review>; effectiveResults: EffectiveQualityResult[]; dashboardUpdateNotice: DashboardUpdateNotice | null; dashboardLastUpdatedAt: string; onConsumeDashboardUpdate: () => void }) {
  const [date, setDate] = useState("2024-10-11");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [visibleUpdateNotice, setVisibleUpdateNotice] = useState<DashboardUpdateNotice | null>(null);
  const [activeGroup, setActiveGroup] = useState("全部分组");
  useEffect(() => {
    if (!dashboardUpdateNotice) return;
    setVisibleUpdateNotice(dashboardUpdateNotice);
    const timer = window.setTimeout(() => {
      setVisibleUpdateNotice(null);
      onConsumeDashboardUpdate();
    }, 3800);
    return () => window.clearTimeout(timer);
  }, [dashboardUpdateNotice?.id]);
  const currentDashboardDate = "2024-10-11";
  const isCurrentDashboardDate = date === currentDashboardDate;
  const historyDates = Array.from(new Set(TREND_DAILY_SOURCE
    .filter(item => item.type === TREND_TYPES[0] && item.date <= currentDashboardDate)
    .map(item => item.date)))
    .slice(-15)
    .reverse();
  const groups = ["全部分组", ...DAILY_GROUP_DATA.map(item => item.group)];
  const qualityCorrections = new Map<string, { scoreDelta: number; issueDelta: number; deductionDelta: number }>();
  const addCorrection = (agent: string, originalScore: number, finalScore: number) => {
    const current = qualityCorrections.get(agent) ?? { scoreDelta: 0, issueDelta: 0, deductionDelta: 0 };
    current.scoreDelta += finalScore - originalScore;
    current.issueDelta += Number(finalScore < 100) - Number(originalScore < 100);
    current.deductionDelta += originalScore - finalScore;
    qualityCorrections.set(agent, current);
  };
  if (isCurrentDashboardDate) effectiveResults.forEach(result => {
    const complaint = complaints.find(item => item.id === result.complaintId);
    if (complaint) addCorrection(complaint.agent, result.aiScore, result.effectiveScore);
  });
  const completedManualReviews = isCurrentDashboardDate ? effectiveResults.flatMap(result => {
    if (!result.manualReview) return [];
    const complaint = complaints.find(item => item.id === result.complaintId);
    return complaint ? [{ complaint, review: result.manualReview, finalScore: result.baseSource === "manual" ? reviewFinalScore(complaint, result.manualReview) : result.aiScore }] : [];
  }) : [];
  const historyDay = Number(date.slice(-2));
  const adjustedAgentData = DAILY_AGENT_DATA.map((item, index) => {
    const correction = qualityCorrections.get(item.agent) ?? { scoreDelta: 0, issueDelta: 0, deductionDelta: 0 };
    const complaintDelta = isCurrentDashboardDate ? 0 : ((historyDay + index * 2) % 3) - 1;
    const scoreDelta = isCurrentDashboardDate ? 0 : (((historyDay * 3 + index * 2) % 7) - 3) * 0.7;
    const issueDelta = isCurrentDashboardDate ? 0 : ((historyDay + index) % 3) - 1;
    const deductionDelta = isCurrentDashboardDate ? 0 : (((historyDay + index * 3) % 5) - 2) * 0.35;
    const complaintCount = Math.max(1, item.complaintCount + complaintDelta);
    return {
      ...item,
      complaintCount,
      issueCount: Math.max(0, Math.min(complaintCount, item.issueCount + correction.issueDelta + issueDelta)),
      averageScore: Number(Math.max(0, Math.min(100, item.averageScore + correction.scoreDelta / item.complaintCount + scoreDelta)).toFixed(1)),
      averageDeduction: Number(Math.max(0, item.averageDeduction + correction.deductionDelta / item.complaintCount + deductionDelta).toFixed(1)),
    };
  });
  const adjustedGroupData = DAILY_GROUP_DATA.map(group => {
    const agents = adjustedAgentData.filter(item => item.group === group.group);
    const complaintCount = agents.reduce((sum, item) => sum + item.complaintCount, 0) || group.complaintCount;
    return {
      ...group,
      complaintCount,
      issueCount: agents.reduce((sum, item) => sum + item.issueCount, 0),
      averageScore: agents.length ? agents.reduce((sum, item) => sum + item.averageScore * item.complaintCount, 0) / complaintCount : group.averageScore,
      averageDeduction: agents.length ? agents.reduce((sum, item) => sum + item.averageDeduction * item.complaintCount, 0) / complaintCount : group.averageDeduction,
    };
  });
  const isAllGroups = activeGroup === "全部分组";
  const visibleAgents = isAllGroups ? adjustedAgentData : adjustedAgentData.filter(item => item.group === activeGroup);
  const trainingIssues = activeGroup === "全部分组" ? [] : DAILY_TRAINING_ISSUES[activeGroup] ?? [];
  const chartData = isAllGroups ? adjustedGroupData : visibleAgents;
  const totalComplaints = adjustedGroupData.reduce((sum, item) => sum + item.complaintCount, 0);
  const acceptedAppealCount = isCurrentDashboardDate ? appealRecords.filter(item => item.accepted).length : (historyDay + 1) % 4;
  const appealRate = totalComplaints ? acceptedAppealCount / totalComplaints * 100 : 0;
  const weightedScore = adjustedGroupData.reduce((sum, item) => sum + item.averageScore * item.complaintCount, 0) / totalComplaints;
  const sentimentTopics = sentimentTopicsForDate(date);
  const sentimentTotal = sentimentTopics.reduce((sum, item) => sum + item.count, 0);
  const topSentimentTopic = sentimentTopics[0];
  const pendingAppealCount = isCurrentDashboardDate ? appealRecords.filter(item => item.status === "待处理").length : 0;
  const pendingManualCount = isCurrentDashboardDate ? HUMAN_REVIEW_QUEUE.length - completedManualReviews.length : 0;
  const manualCompletedCount = HUMAN_REVIEW_QUEUE.length - pendingManualCount;
  const appealProcessedCount = appealRecords.length - pendingAppealCount;
  const metricsUnlocked = !isCurrentDashboardDate || pendingManualCount === 0;
  const dashboardStatus = !isCurrentDashboardDate
    ? `${date.slice(5).replace("-", "月")}日数据已核定`
    : pendingManualCount > 0
      ? `等待人工复检 · 待复检 ${pendingManualCount}`
      : pendingAppealCount > 0
        ? `看板已生成 · 待处理申诉 ${pendingAppealCount}`
        : "今日数据已核定 · 人工结果已合并";
  const dashboardTrendSource = TREND_DAILY_SOURCE.map(record => record.date === date && record.type === TREND_TYPES[0]
    ? { ...record, issueCount: Math.max(0, record.issueCount + effectiveResults.reduce((sum, result) => sum + Number(result.effectiveScore < 100) - Number(result.aiScore < 100), 0)) }
    : record);
  const dashboardTrendDate = new Date(`${date}T00:00:00Z`);
  const dashboardTrendStart = new Date(dashboardTrendDate);
  dashboardTrendStart.setUTCDate(dashboardTrendStart.getUTCDate() - 15 + 1);
  const dashboardTrendData = aggregateTrendRecords(dashboardTrendSource.filter(record => record.date >= dashboardTrendStart.toISOString().slice(0, 10) && record.date <= date), "按日");
  const trainingSuggestions = Object.entries(DAILY_TRAINING_ISSUES)
    .flatMap(([group, issues]) => issues.map(item => ({ ...item, group })))
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="relative flex min-h-[58px] flex-wrap items-center justify-between gap-3 border-b border-[#e2e6eb] bg-white px-5 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold text-[#2f3b48]">每日质检</h1>
            {!isCurrentDashboardDate && <><span className="rounded-full bg-[#eef4ff] px-2 py-1 text-[9px] font-medium text-[#4b7ff0]">历史记录 · {date}</span><button type="button" onClick={() => { setDate(currentDashboardDate); setActiveGroup("全部分组"); setHistoryOpen(false); }} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2 py-1 text-[9px] font-medium text-[#4b7ff0] transition hover:bg-[#eef5ff]"><RotateCcw className="size-3" />返回今日</button></>}
            <div className="relative"><button type="button" onClick={() => { setScopeOpen(value => !value); setHistoryOpen(false); }} className={`flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-medium transition ${metricsUnlocked && pendingAppealCount === 0 ? "bg-[#eaf7f0] text-[#27955d] hover:bg-[#def2e7]" : "bg-[#fff5e8] text-[#b9791d] hover:bg-[#ffefd8]"}`}>{metricsUnlocked && pendingAppealCount === 0 ? <ShieldCheck className="size-3" /> : <Clock className="size-3" />}{dashboardStatus}<ChevronRight className={`size-3 transition-transform ${scopeOpen ? "rotate-90" : ""}`} /></button>{scopeOpen && <div className="absolute left-0 top-8 z-40 w-[310px] overflow-hidden rounded-xl border border-[#dce4ef] bg-white text-left shadow-[0_14px_40px_rgba(41,53,66,.16)]"><div className="border-b border-[#edf0f3] px-4 py-3"><div className="text-[11px] font-semibold text-[#374350]">当前数据口径</div><div className="mt-0.5 text-[9px] text-[#98a3af]">每条客诉均采用当前最新有效结果实时计算</div></div><div className="space-y-1 p-2"><div className="flex items-center justify-between rounded-lg px-3 py-2 text-[10px]"><span className="text-[#687789]">AI 全量质检</span><span className="font-medium text-[#374350]">{totalComplaints} 条已完成</span></div><button type="button" disabled={!isCurrentDashboardDate} onClick={() => { setScopeOpen(false); onOpenManualReviews(); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[10px] ${isCurrentDashboardDate ? "hover:bg-[#f6f8fb]" : "cursor-default"}`}><span className="text-[#687789]">人工复检核定</span><span className={`font-medium ${pendingManualCount ? "text-[#b9791d]" : "text-[#27955d]"}`}>{manualCompletedCount} / {HUMAN_REVIEW_QUEUE.length} 条{isCurrentDashboardDate && <ChevronRight className="ml-1 inline size-3" />}</span></button><button type="button" disabled={!isCurrentDashboardDate} onClick={() => { setScopeOpen(false); onOpenAppeals(); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[10px] ${isCurrentDashboardDate ? "hover:bg-[#f6f8fb]" : "cursor-default"}`}><span className="text-[#687789]">客服申诉处理</span><span className={`font-medium ${pendingAppealCount ? "text-[#b9791d]" : "text-[#27955d]"}`}>{appealProcessedCount} / {appealRecords.length} 条{isCurrentDashboardDate && <ChevronRight className="ml-1 inline size-3" />}</span></button></div><div className="flex items-center justify-between border-t border-[#edf0f3] bg-[#fafbfc] px-4 py-2.5 text-[9px] text-[#98a3af]"><span>{metricsUnlocked ? (pendingAppealCount > 0 ? "指标已生成，申诉结果会实时更新" : "当前指标已完成核定") : "等待人工复检完成后自动更新"}</span><span>更新于 {isCurrentDashboardDate ? dashboardLastUpdatedAt : "23:59"}</span></div></div>}</div>
          </div>
          <p className="mt-0.5 text-[10px] text-[#8b96a3]">{isCurrentDashboardDate ? "AI已完成昨日客诉预检，今日请完成人工质检并处理客服申诉" : `正在查看 ${date} 的全量质检结果`}</p>
        </div>
        <div className="relative">
          <button type="button" onClick={() => setHistoryOpen(value => !value)} className={`flex h-8 items-center gap-1.5 rounded-md border px-3 text-[10px] font-medium transition ${historyOpen ? "border-[#9eb9f5] bg-[#eef5ff] text-[#3562c8]" : "border-[#dbe3ee] bg-white text-[#4b7ff0] hover:bg-[#eef5ff]"}`}><History className="size-3.5" />查看历史记录<ChevronRight className={`size-3 transition-transform ${historyOpen ? "rotate-90" : ""}`} /></button>
          {historyOpen && <div className="absolute right-0 top-10 z-30 w-[300px] overflow-hidden rounded-xl border border-[#dce4ef] bg-white shadow-[0_14px_40px_rgba(41,53,66,.16)]"><div className="border-b border-[#edf0f3] px-4 py-3"><div className="text-[11px] font-semibold text-[#374350]">历史质检记录</div><div className="mt-0.5 text-[9px] text-[#98a3af]">点击日期切换当天的数据看板与质检记录</div></div><div className="max-h-[340px] overflow-auto p-2">{historyDates.map(item => { const selected = item === date; const current = item === currentDashboardDate; return <button key={item} type="button" onClick={() => { setDate(item); setActiveGroup("全部分组"); setHistoryOpen(false); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${selected ? "bg-[#eef4ff]" : "hover:bg-[#f6f8fb]"}`}><span className={`grid size-7 place-items-center rounded-lg ${selected ? "bg-[#4b7ff0] text-white" : "bg-[#f0f3f7] text-[#7f8b99]"}`}><CalendarDays className="size-3.5" /></span><span><span className={`block text-[10px] font-medium ${selected ? "text-[#3562c8]" : "text-[#4d5966]"}`}>{item}</span><span className="mt-0.5 block text-[9px] text-[#98a3af]">{current ? "今日记录" : "全量质检已完成"}</span></span>{selected && <Check className="ml-auto size-3.5 text-[#4b7ff0]" />}</button>; })}</div></div>}
        </div>
      </header>
      {visibleUpdateNotice && isCurrentDashboardDate && <div className="fixed right-6 top-[96px] z-50 flex max-w-[380px] items-center gap-2.5 rounded-xl border border-[#cfe7da] bg-white px-4 py-3 shadow-[0_12px_36px_rgba(41,53,66,.16)]"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#eaf7f0] text-[#27955d]"><RefreshCw className="size-3.5" /></span><div><div className="text-[10px] font-medium text-[#405063]">{visibleUpdateNotice.message}</div><div className="mt-0.5 text-[9px] text-[#98a3af]">看板已按最新有效结果重新计算 · {visibleUpdateNotice.at}</div></div></div>}


      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => onOpenRecords(date)}
              className="group rounded-lg border border-[#dce6f4] bg-white p-3.5 text-left shadow-[0_1px_3px_rgba(41,53,66,.03)] transition hover:border-[#9eb9f5] hover:bg-[#f8fbff] hover:shadow-[0_5px_14px_rgba(75,127,240,.10)]"
            >
              <div className="flex items-center justify-between text-[10px] text-[#8b97a3]"><span>{isCurrentDashboardDate ? "AI已预检昨日全部客诉" : "当日已质检客诉"}</span><ClipboardCheck className="size-4 text-[#7d9ff2] transition group-hover:text-[#4b7ff0]" /></div>
              <div className="mt-2 text-[25px] font-bold leading-none text-[#33465e]">{totalComplaints}</div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-[#98a3af]"><span>覆盖 {DAILY_GROUP_DATA.length} 个客服分组</span><span className="text-[#4b7ff0] opacity-0 transition group-hover:opacity-100">查看记录 →</span></div>
            </button>
            <button
              type="button"
              onClick={onOpenManualReviews}
              className={`group rounded-lg border p-3.5 text-left shadow-[0_1px_3px_rgba(41,53,66,.03)] transition ${pendingManualCount > 0 ? "border-[#f0dfbd] bg-[#fffdf8] hover:border-[#e7c888] hover:bg-[#fffaf0] hover:shadow-[0_5px_14px_rgba(210,134,47,.10)]" : "border-[#dce6f4] bg-white hover:border-[#9eb9f5] hover:bg-[#f8fbff] hover:shadow-[0_5px_14px_rgba(75,127,240,.10)]"}`}
            >
              <div className="flex items-center justify-between text-[10px] text-[#8b97a3]"><span>待人工复检的客诉数</span>{pendingManualCount > 0 ? <Clock className="size-4 text-[#d2862f] transition group-hover:translate-x-0.5 group-hover:text-[#b9791d]" /> : <ShieldCheck className="size-4 text-[#27955d]" />}</div>
              <div className={`mt-2 text-[25px] font-bold leading-none ${pendingManualCount > 0 ? "text-[#d2862f]" : "text-[#27955d]"}`}>{pendingManualCount}</div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-[#98a3af]"><span>仍需人工兜底 {HUMAN_REVIEW_QUEUE.length} 条</span><span className="text-[#4b7ff0] opacity-0 transition group-hover:opacity-100">查看人工质检队列 →</span></div>
            </button>
            <button type="button" onClick={onOpenAppeals} className="group rounded-lg border border-[#dce6f4] bg-white p-3.5 text-left shadow-[0_1px_3px_rgba(41,53,66,.03)] transition hover:border-[#edc894] hover:bg-[#fffdf8] hover:shadow-[0_5px_14px_rgba(210,134,47,.10)]"><div className="flex items-center justify-between text-[10px] text-[#8b97a3]"><span>客服申诉记录数</span><MessageSquareWarning className="size-4 text-[#d2862f] transition group-hover:text-[#b9791d]" /></div><div className="mt-2 text-[25px] font-bold leading-none text-[#d2862f]">{acceptedAppealCount}</div><div className="mt-2 flex items-center justify-between text-[10px] text-[#98a3af]"><span>AI 误检率 <span className="font-medium text-[#d2862f]">{appealRate.toFixed(1)}%</span></span><span className="text-[#b9791d] opacity-0 transition group-hover:opacity-100">展开记录 →</span></div></button>
            <button type="button" onClick={() => onOpenSentiment(date)} className="group rounded-lg border border-[#dce6f4] bg-white p-3.5 text-left shadow-[0_1px_3px_rgba(41,53,66,.03)] transition hover:border-[#9eb9f5] hover:bg-[#f8fbff] hover:shadow-[0_5px_14px_rgba(75,127,240,.10)]"><div className="flex items-center justify-between text-[10px] text-[#8b97a3]"><span>玩家舆情分析</span><MessageSquareText className="size-4 text-[#6d95f5] transition group-hover:text-[#4b7ff0]" /></div><div className="mt-2 text-[25px] font-bold leading-none text-[#536a89]">{sentimentTotal}<span className="ml-1 text-[12px] font-medium">次</span></div><div className="mt-2 flex items-center justify-between text-[10px] text-[#98a3af]"><span>主要方向：{topSentimentTopic?.topic ?? "暂无"}</span><span className="text-[#4b7ff0] opacity-0 transition group-hover:opacity-100">展开分析 →</span></div></button>
          </div>


          {metricsUnlocked ? (
            <>
              <div className="rounded-lg border border-[#dce6f4] bg-white p-4 shadow-[0_1px_3px_rgba(41,53,66,.03)]">
                <div className="mb-3 flex items-center justify-between"><div><div className="text-[12px] font-semibold text-[#374350]">质量数据看板</div><div className="mt-0.5 text-[10px] text-[#8b97a3]">人工复检完成后生成，客服申诉处理结果会实时同步</div></div><span className={`rounded-full px-2 py-1 text-[9px] font-medium ${pendingAppealCount > 0 ? "bg-[#fff5e8] text-[#b9791d]" : "bg-[#eaf7f0] text-[#27955d]"}`}>{pendingAppealCount > 0 ? `待处理申诉 ${pendingAppealCount}` : "人工复检已完成"}</span></div>
                <div className="grid gap-3 lg:grid-cols-[.72fr_1.28fr]">
                  <div className="px-1 py-2 lg:pr-5"><div className="flex items-center gap-2 text-[10px] font-medium text-[#687789]"><TrendingUp className="size-3.5 text-[#4b7ff0]" />整体平均分</div><div className={`mt-2 text-[31px] font-bold leading-none ${scoreTone(weightedScore)}`}>{weightedScore.toFixed(1)}<span className="ml-1 text-[12px] font-medium text-[#8b97a3]">分</span></div><div className="mt-2 text-[10px] text-[#98a3af]">当前日期：{date} · 人工复检已完成</div></div>
                  <div className="px-1 py-2.5 lg:border-l lg:border-[#edf1f5] lg:pl-5"><div className="mb-1 text-[10px] font-medium text-[#687789]">整体趋势看板 <span className="font-normal text-[#a0acb8]">· 近 15 日</span></div><div className="grid gap-2 md:grid-cols-2"><div><div className="mb-0.5 text-[9px] text-[#8b97a3]">客诉处理量与问题数</div><div className="h-[138px]"><ResponsiveContainer width="100%" height="100%"><RechartsLineChart data={dashboardTrendData} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><CartesianGrid stroke="#edf1f5" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#9aa5b1", fontSize: 8 }} axisLine={false} tickLine={false} minTickGap={18} /><YAxis allowDecimals={false} tick={{ fill: "#9aa5b1", fontSize: 8 }} axisLine={false} tickLine={false} /><RechartsTooltip contentStyle={{ border: "1px solid #dce6f4", borderRadius: 8, fontSize: 10, boxShadow: "0 6px 18px rgba(41,53,66,.12)" }} /><Legend iconType="circle" wrapperStyle={{ fontSize: 9, color: "#687789" }} /><RechartsLine type="monotone" dataKey="complaintCount" name="处理量" stroke="#687ff0" strokeWidth={2} dot={false} /><RechartsLine type="monotone" dataKey="issueCount" name="问题数" stroke="#d98a35" strokeWidth={2} dot={false} /></RechartsLineChart></ResponsiveContainer></div></div><div><div className="mb-0.5 text-[9px] text-[#8b97a3]">客诉问题率</div><div className="h-[138px]"><ResponsiveContainer width="100%" height="100%"><RechartsLineChart data={dashboardTrendData} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><CartesianGrid stroke="#edf1f5" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#9aa5b1", fontSize: 8 }} axisLine={false} tickLine={false} minTickGap={18} /><YAxis domain={[0, "auto"]} tick={{ fill: "#9aa5b1", fontSize: 8 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => `${value}%`} /><RechartsTooltip contentStyle={{ border: "1px solid #dce6f4", borderRadius: 8, fontSize: 10, boxShadow: "0 6px 18px rgba(41,53,66,.12)" }} /><RechartsLine type="monotone" dataKey="issueRate" name="问题率" stroke="#55a58b" strokeWidth={2} dot={false} /></RechartsLineChart></ResponsiveContainer></div></div></div></div>
                </div>
                {isAllGroups && <div className="mt-4 border-t border-[#f0e5d5] pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-[#5c6470]"><Sparkles className="size-3.5 text-[#d9a34e]" />质培建议摘要</div>
                      <p className="mt-1 text-[10px] text-[#8b7a63]">根据当前已核定结果，优先关注发生次数较高的问题项</p>
                    </div>
                    <button type="button" onClick={() => onOpenTrend(date)} className="group flex shrink-0 items-center gap-1 text-[10px] font-medium text-[#b9791d] transition hover:underline"><span>查看完整趋势解读与质培建议</span><ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" /></button>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {trainingSuggestions.map(item => <div key={`${item.group}-${item.issue}`} className="px-1 py-2.5"><div className="flex items-center gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#f5dfbd] text-[9px] font-semibold text-[#b9791d]">!</span><span className="text-[10px] font-semibold text-[#5b6572]">{item.issue}</span><span className="ml-auto rounded-full bg-[#f7ead6] px-2 py-0.5 text-[9px] font-medium text-[#b9791d]">{item.count} 次</span></div><div className="mt-1 pl-7 text-[9px] text-[#98a3af]">{item.group}</div><p className="mt-1 pl-7 text-[10px] leading-relaxed text-[#7b8794]">建议：{item.suggestion}</p></div>)}
                  </div>
                </div>}
              </div>
              <div className="flex items-center gap-2 overflow-x-auto px-1 py-2"><span className="mr-1 shrink-0 text-[10px] font-medium text-[#687789]">分组筛选</span>{groups.map(group => <button key={group} type="button" onClick={() => setActiveGroup(group)} className={`shrink-0 rounded-md px-2.5 py-1.5 text-[10px] transition ${activeGroup === group ? "bg-[#eaf2ff] font-medium text-[#3562c8]" : "text-[#8b97a3] hover:bg-[#f3f6fa] hover:text-[#5a6572]"}`}>{group}</button>)}</div>
          <div className="grid gap-3 xl:grid-cols-[1.08fr_.92fr]">
            <div className="px-1 py-3">
              <div className="mb-1 flex items-center justify-between"><div><div className="text-[12px] font-semibold text-[#374350]">{isAllGroups ? "各分组平均分" : `${activeGroup}各客服平均分`}</div><div className="mt-0.5 text-[10px] text-[#8b97a3]">{isAllGroups ? "快速识别需要优先关注的客服组" : "点击下方客服明细，可查看该客服的客诉判分列表"}</div></div><span className="rounded-full bg-[#eef4ff] px-2 py-1 text-[9px] text-[#4b7ff0]">满分 100</span></div>
              <div className="h-[218px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout={isAllGroups ? "vertical" : "horizontal"} margin={{ top: 6, right: 20, left: isAllGroups ? 4 : 0, bottom: isAllGroups ? 0 : 20 }}>
                    <CartesianGrid stroke="#edf1f5" horizontal={isAllGroups ? false : true} vertical={isAllGroups ? true : false} />
                    {isAllGroups ? (
                      <>
                        <XAxis type="number" domain={[0, 100]} tick={{ fill: "#9aa5b1", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="group" width={78} tick={{ fill: "#667585", fontSize: 10 }} axisLine={false} tickLine={false} />
                      </>
                    ) : (
                      <>
                        <XAxis type="category" dataKey="agent" interval={0} angle={-35} textAnchor="end" height={52} tick={{ fill: "#667585", fontSize: 9 }} axisLine={false} tickLine={false} />
                        <YAxis type="number" domain={[0, 100]} tick={{ fill: "#9aa5b1", fontSize: 10 }} axisLine={false} tickLine={false} />
                      </>
                    )}
                    <RechartsTooltip cursor={{ fill: "#f7faff" }} contentStyle={{ border: "1px solid #dce6f4", borderRadius: 8, fontSize: 11, boxShadow: "0 6px 18px rgba(41,53,66,.12)" }} formatter={(value: number) => [`${value} 分`, "平均分"]} />
                    <Bar dataKey="averageScore" name="平均分" fill="#6d95f5" radius={isAllGroups ? [0, 4, 4, 0] : [4, 4, 0, 0]} barSize={isAllGroups ? 22 : 14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="px-1 py-3">
              {isAllGroups ? (
                <>
                  <div className="mb-1"><div className="text-[12px] font-semibold text-[#374350]">处理量与问题数</div><div className="mt-0.5 text-[10px] text-[#8b97a3]">问题数越高，建议优先进入客服明细复盘</div></div>
                  <div className="h-[218px] w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={adjustedGroupData} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid stroke="#edf1f5" vertical={false} />
                        <XAxis dataKey="group" tick={{ fill: "#667585", fontSize: 9 }} axisLine={false} tickLine={false} interval={0} />
                        <YAxis allowDecimals={false} tick={{ fill: "#9aa5b1", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <RechartsTooltip cursor={{ fill: "#f7faff" }} contentStyle={{ border: "1px solid #dce6f4", borderRadius: 8, fontSize: 11, boxShadow: "0 6px 18px rgba(41,53,66,.12)" }} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 10, color: "#687789" }} />
                        <Bar dataKey="complaintCount" name="处理客诉" fill="#8baaf6" radius={[4, 4, 0, 0]} barSize={18} />
                        <Bar dataKey="issueCount" name="发现问题" fill="#e5a55a" radius={[4, 4, 0, 0]} barSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-2"><div className="text-[12px] font-semibold text-[#374350]">培训关注问题项</div><div className="mt-0.5 text-[10px] text-[#8b97a3]">{activeGroup}中客服频繁失分的规则与建议</div></div>
                  <div className="space-y-2.5 pt-2">
                    {trainingIssues.map((item, index) => <div key={item.issue} className="rounded-lg border border-[#f0e5d5] bg-[#fffaf3] p-2.5"><div className="flex items-center gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#f5dfbd] text-[10px] font-semibold text-[#b9791d]">{index + 1}</span><span className="text-[11px] font-semibold text-[#5b6572]">{item.issue}</span><span className="ml-auto rounded-full bg-[#f7ead6] px-2 py-0.5 text-[9px] font-medium text-[#b9791d]">{item.count} 次</span></div><p className="mt-1.5 pl-7 text-[10px] leading-relaxed text-[#7b8794]">建议：{item.suggestion}</p></div>)}
                  </div>
                </>
              )}
            </div>
          </div>

            </>
          ) : (
            <>
              <div className="rounded-xl border border-[#dce6f4] bg-gradient-to-br from-[#f8fbff] to-[#fffdf8] px-6 py-6 shadow-[0_1px_3px_rgba(41,53,66,.03)]">
                <div className="flex items-center justify-between"><div><div className="text-[12px] font-semibold text-[#374350]">质量数据看板</div><div className="mt-0.5 text-[10px] text-[#8b97a3]">人工复检完成后展示最终核定指标</div></div><span className="rounded-full bg-[#fff5e8] px-2 py-1 text-[9px] font-medium text-[#b9791d]">等待解锁</span></div>
                <div className="px-0 py-8 text-center"><div className="mx-auto grid size-12 place-items-center rounded-full bg-[#eef4ff] text-[#4b7ff0]"><Clock className="size-6" /></div>
                  <div className="mt-3 text-[13px] font-semibold text-[#374350]">完整质检指标将在人工复检完成后展示</div>
                  <p className="mx-auto mt-1.5 max-w-[460px] text-[10px] leading-relaxed text-[#8b97a3]">当前还有 {pendingManualCount} 条客诉待人工复检。完成复检后，将展示整体平均分、分组数据、处理量与问题数及质培指导意见；客服申诉结果会在看板中实时更新。</p>
                  <div className="mt-4 flex justify-center gap-2">
                    {pendingManualCount > 0 && <button type="button" onClick={onOpenManualReviews} className="rounded-md bg-[#4b7ff0] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#3d6fe0]">处理待复检 ({pendingManualCount})</button>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto px-1 py-2"><span className="mr-1 shrink-0 text-[10px] font-medium text-[#687789]">分组筛选</span>{groups.map(group => <button key={group} type="button" disabled className={`shrink-0 rounded-md px-2.5 py-1.5 text-[10px] ${activeGroup === group ? "bg-[#eaf2ff] font-medium text-[#3562c8]" : "text-[#b0bac6]"}`}>{group}</button>)}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HumanReviewQueue({ commonCats, privateCats, complaints, openComplaintId, setOpenComplaintId, reviews, setReviews, onGoToRuleView, canFeedback, onSummaryFeedback, onDashboardUpdate, currentUserName, reviewedAt, onBackToDaily }: { commonCats: Cat[]; privateCats: Cat[]; complaints: Complaint[]; openComplaintId: string | null; setOpenComplaintId: (id: string | null) => void; reviews: Record<string, Review>; setReviews: React.Dispatch<React.SetStateAction<Record<string, Review>>>; onGoToRuleView: (name: string) => void; canFeedback: boolean; onSummaryFeedback: (taskName: string, c: Complaint, text: string) => void; onDashboardUpdate: (message: string) => void; currentUserName: string; reviewedAt: string; onBackToDaily?: () => void }) {
  const [tab, setTab] = useState<"pending" | "processed">("pending");
  const queueRows = HUMAN_REVIEW_QUEUE.map(item => {
    const complaint = complaints.find(row => row.id === item.complaintId);
    const review = reviews[item.complaintId];
    const completed = !!review && review.source === "manual" && (review.agreed || review.submitted);
    const score = completed && !review.agreed && review.suggestedScore.trim() !== "" && !Number.isNaN(Number(review.suggestedScore))
      ? Number(review.suggestedScore)
      : complaint?.score ?? 0;
    return { ...item, complaint, review, completed, finalScore: score };
  }).filter(item => item.complaint);
  const pendingRows = queueRows.filter(item => !item.completed);
  const processedRows = queueRows.filter(item => item.completed);
  const shownRows = tab === "pending" ? pendingRows : processedRows;
  const openComplaint = openComplaintId ? complaints.find(item => item.id === openComplaintId) ?? null : null;

  if (openComplaint && HUMAN_REVIEW_QUEUE.some(item => item.complaintId === openComplaint.id)) {
    return <ConversationReview complaint={openComplaint} review={reviews[openComplaint.id] ?? null} commonCats={commonCats} privateCats={privateCats} onBack={() => setOpenComplaintId(null)} onSave={review => { setReviews(prev => ({ ...prev, [openComplaint.id]: { ...review, source: "manual", reviewerName: currentUserName, reviewedAt } })); if (review.agreed || review.submitted) { const finalScore = !review.agreed && review.suggestedScore.trim() !== "" && Number.isFinite(Number(review.suggestedScore)) ? Number(review.suggestedScore) : openComplaint.score; onDashboardUpdate(finalScore === openComplaint.score ? `已同步人工复检结果，${openComplaint.agent}的 AI 原判已完成人工核定` : `已同步人工复检结果，${openComplaint.agent}客诉由 ${openComplaint.score} 分调整为 ${finalScore} 分`); } }} onGoToRule={onGoToRuleView} canFeedback={canFeedback} onSummaryFeedback={(complaint, text) => onSummaryFeedback("2024-10-11 人工待检队列", complaint, text)} />;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex min-h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5 py-3">
        <div className="flex items-center gap-3">{onBackToDaily && <button type="button" onClick={onBackToDaily} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]"><ChevronRight className="size-3 rotate-180" />返回每日质检</button>}<div><h1 className="text-[15px] font-semibold text-[#2f3b48]">待检队列</h1><p className="mt-0.5 text-[10px] text-[#8b96a3]">AI 全量质检，重要客诉由系统自动分流至人工复检</p></div></div>
        <div className="flex items-center gap-2 text-[10px] text-[#8b97a3]"><CalendarDays className="size-3.5" />2024-10-11</div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-[1180px] space-y-3">
          {pendingRows.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-[#edf8f2] px-3.5 py-2.5 text-[#27955d]"><ShieldCheck className="size-4 shrink-0" /><div className="text-[10px]"><span className="font-semibold">今日待复检客诉已全部处理完成。</span><span className="ml-1 text-[#5f8f74]">人工核定结果已同步至每日质检看板。</span></div></div>
          )}
          <div className="overflow-hidden rounded-lg border border-[#e1e6eb] bg-white">
            <div className="flex items-center justify-between border-b border-[#edf0f3] px-4 py-3">
              <div className="flex gap-1 rounded-md bg-[#f5f7fa] p-1"><button onClick={() => setTab("pending")} className={`rounded px-3 py-1.5 text-[10px] font-medium ${tab === "pending" ? "bg-white text-[#4b7ff0] shadow-sm" : "text-[#8b97a3]"}`}>待复检 <span className="ml-1 rounded-full bg-[#fff0f0] px-1.5 py-0.5 text-[9px] text-[#d75d5d]">{pendingRows.length}</span></button><button onClick={() => setTab("processed")} className={`rounded px-3 py-1.5 text-[10px] font-medium ${tab === "processed" ? "bg-white text-[#4b7ff0] shadow-sm" : "text-[#8b97a3]"}`}>已复检 <span className="ml-1 rounded-full bg-[#eef4ff] px-1.5 py-0.5 text-[9px] text-[#4b7ff0]">{processedRows.length}</span></button></div>
            </div>
            {shownRows.length === 0 ? (
              <div className="p-10 text-center text-[11px] text-[#98a3af]">{tab === "pending" ? "当前没有待复检客诉" : "当前没有已复检记录"}</div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[980px]">
                  <div className="grid grid-cols-[42px_1fr_1fr_1.25fr_1fr_92px_108px_92px] items-center bg-[#fafbfc] px-4 py-2 text-[9px] text-[#8b97a3]"><span>序号</span><span>客服</span><span>客服类型</span><span>用户名</span><span>客诉ID</span><span>评分结果</span><span>客诉日期</span><span className="text-right">操作</span></div>
                  {shownRows.map((item, index) => {
                    const complaint = item.complaint!;
                    return <div key={item.complaintId} className="grid grid-cols-[42px_1fr_1fr_1.25fr_1fr_92px_108px_92px] items-center border-t border-[#edf0f3] px-4 py-2.5 text-[10px] transition hover:bg-[#f8fbff]"><span className="text-[#8b97a3]">{index + 1}</span><span className="truncate font-medium text-[#465260]">{complaint.agent}</span><span className="truncate text-[#687789]">{complaint.agentType}</span><span className="truncate text-[#687789]">{complaint.user}</span><span className="font-medium text-[#5f6b78]">{complaint.id}</span><span className={`text-[14px] font-bold ${scoreTone(item.completed ? item.finalScore : complaint.score)}`}>{item.completed ? item.finalScore : complaint.score}<span className="ml-1 text-[9px] font-normal text-[#a0acb8]">分</span></span><span className="text-[#687789]">{item.date}</span><div className="text-right"><button onClick={() => setOpenComplaintId(complaint.id)} className={`rounded-md px-2.5 py-1.5 text-[9px] font-medium ${item.completed ? "border border-[#d9e2ee] bg-white text-[#4b7ff0] hover:bg-[#eef5ff]" : "bg-[#4b7ff0] text-white hover:bg-[#3d6fe0]"}`}>{item.completed ? "查看结果" : "开始复检"}</button></div></div>;
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QualityHome({ commonCats, privateCats, complaints, aiVersion, currentRuleVersion, rerunTask, openTaskName, setOpenTaskName, openComplaintId, setOpenComplaintId, reviews, setReviews, tasks, setTasks, onGoToRuleView, canFeedback, onSummaryFeedback }: { commonCats: Cat[]; privateCats: Cat[]; complaints: Complaint[]; aiVersion: number; currentRuleVersion: string; rerunTask: () => void; openTaskName: string | null; setOpenTaskName: (name: string | null) => void; openComplaintId: string | null; setOpenComplaintId: (id: string | null) => void; reviews: Record<string, Review>; setReviews: React.Dispatch<React.SetStateAction<Record<string, Review>>>; tasks: TaskRow[]; setTasks: React.Dispatch<React.SetStateAction<TaskRow[]>>; onGoToRuleView: (name: string) => void; canFeedback: boolean; onSummaryFeedback: (taskName: string, c: Complaint, text: string) => void }) {
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

function ConversationReview({ complaint, review, commonCats, privateCats, onBack, onSave, onGoToRule, canFeedback, onSummaryFeedback }: { complaint: Complaint; review: Review | null; commonCats: Cat[]; privateCats: Cat[]; onBack: () => void; onSave: (r: Review) => void; onGoToRule: (name: string) => void; canFeedback: boolean; onSummaryFeedback: (c: Complaint, text: string) => void }) {
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
    onSave({ ...base, source: "manual", ...patch });
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
    onSave({ agreed: true, submitted: true, objectedRules: [], reran: false, suggestedScore: "", detail: "", agentNote: "", deductedRules: [], source: "manual" });
  }
  // 点「有异议」：立即建立异议草稿，返回后仍在异议流程中。
  function startObjection() {
    setSelectedRules([]); setScore(""); setDetail(""); setAgentNote(""); setDeductedRules([]); setErr(""); setEditing(true);
    onSave({ agreed: false, submitted: false, objectedRules: [], reran: false, suggestedScore: "", detail: "", agentNote: "", deductedRules: [], source: "manual" });
  }
  function submitObjection() {
    if (!score.trim()) { setErr("请填写该客服应有的总分"); return; }
    onSave({ agreed: false, submitted: true, objectedRules: [], reran: !!review?.reran, suggestedScore: score.trim(), detail: "", agentNote: agentNote.trim(), deductedRules: [], appealResolved: false, appealAccepted: false, source: "manual" });
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
            <div className="shrink-0 overflow-hidden rounded-md border border-[#dce6f4] bg-white">
            <div className="flex items-center justify-between border-b border-[#eef2f7] px-5 py-4">
              <span className="flex items-center gap-1.5 text-[14px] font-semibold text-[#33465e]">AI 评分明细
                {reran && <span className="rounded-full bg-[#eef4ff] px-1.5 py-0.5 text-[9px] font-medium text-[#4b7ff0]">已重运行</span>}
              </span>
              {(() => {
                const val = reran ? preview.newScore : complaint.score;
                return (
                  <div className="flex items-center gap-1.5 text-[14px] font-semibold text-[#27955d]">
                    {reran && <span className="text-[10px] text-[#98a3af] line-through">{complaint.score}</span>}
                    <span>{val} 分</span>
                  </div>
                );
              })()}
            </div>

            <div className="p-4">
            {/* 明细项：重运行后展示新明细，被移除项以删除线标出 */}
            {complaint.aiIssues.length === 0 ? (
              <div className="flex items-center gap-2.5 border-l-2 border-[#b8e2c8] bg-[#f2faf5] px-3 py-3.5 text-[11px] text-[#27955d]">
                <span className="grid size-6 shrink-0 place-items-center bg-[#d7f0e1] text-[#27955d]"><Check className="size-3.5" /></span>
                本次会话无扣分项，AI 判定表现良好。
              </div>
            ) : (
              <div className="overflow-hidden border border-[#f0dada] bg-[#fdf7f7] px-4 py-3">
                {complaint.aiIssues.map((iss, i) => {
                  const removed = reran && objectedRules.includes(iss.rule);
                  return (
                    <div key={i} className={`relative py-1.5 pl-0 transition ${removed ? "text-[#6f8c55]" : ""}`}>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 text-[12px] font-medium ${removed ? "bg-[#e7f2dc] text-[#5c8a3a]" : "bg-[#fce4e4] text-[#df665f]"}`}>沟通技巧 · {iss.rule}</span>
                        <span className={`text-[12px] font-medium ${removed ? "text-[#5c8a3a] line-through" : "text-[#df665f]"}`}>{iss.score}</span>
                        {removed && <span className="ml-auto flex items-center gap-1 text-[9px] font-medium text-[#5c8a3a]"><Check className="size-2.5" />已按新规则撤销</span>}
                      </div>
                      <div className="mt-2 text-[11px] leading-relaxed text-[#6f8095]"><span className="font-medium text-[#5c6978]">扣分原因：</span>{iss.reason ?? "AI 根据该评分规则识别到客服回复存在改进空间。"}</div>
                      <div className="mt-1.5 text-[11px] italic leading-relaxed text-[#8b97a4]"><span className="not-italic font-medium text-[#5c6978]">引用原句：</span>{iss.quote}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {complaint.aiSuggestion && (
              <div className="mt-3 border border-[#dce8f7] bg-[#f6f9ff] px-3 py-3">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold text-[#4b6fae]"><Lightbulb className="size-3.5" />建议</div>
                <div className="text-[10px] leading-relaxed text-[#6f8095]">{complaint.aiSuggestion}</div>
              </div>
            )}

            {reran && (
              <div className="mt-3 flex items-center gap-1.5 border-l-2 border-[#b8dfc7] bg-[#eef8f2] px-3 py-2 text-[10px] leading-relaxed text-[#27955d]">
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
                  <div>
                    <div className="mb-1.5 text-[10px] text-[#8b97a3]">该客服应有的总分</div>
                    <span className={`text-[18px] font-bold ${Number(review!.suggestedScore) >= 90 ? "text-[#27955d]" : Number(review!.suggestedScore) >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]"}`}>{review!.suggestedScore}<span className="ml-0.5 text-[10px] font-normal text-[#a8b2be]">分</span></span>
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
    // 同一维度若因客服类型而有不同标准，详情中直接拆成独立建议卡片；
    // 类型只作为标题标签出现，正文保持「现行判断标准 → 建议修改为」的简单结构。
    const displayDimOps: (DimOp & { agentTypes: AgentType[] })[] = r.dimOps.flatMap(e =>
      e.typeGroups && e.typeGroups.length > 0
        ? e.typeGroups.map(group => ({
            ...e,
            freq: group.overturnedCount,
            prob: group.prob,
            oldCriteria: group.oldCriteria,
            newCriteria: group.newCriteria ?? e.newCriteria,
            typeGroups: undefined,
            agentTypes: group.label
              ? [group.label]
              : SEED_AGENT_TYPES.length === group.agentTypes.length &&
                  SEED_AGENT_TYPES.every(type => group.agentTypes.includes(type))
                ? ["全部客服"]
                : group.agentTypes,
          }))
        : [{ ...e, agentTypes: [] }]
    );
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

            {/* 核心结果概览：仅展示原型要求的复审准确率指标。 */}
            <div className="rounded-lg border border-[#dce6f4] bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[12px] font-semibold text-[#35414e]">复审结果概览</div>
                <span className="text-[10px] text-[#98a3af]">AI 评分与人工复审对比</span>
              </div>
              <div className="rounded-md bg-[#f4f8ff] px-4 py-4">
                <div className="text-[10px] text-[#71809a]">复审准确率</div>
                <div className="mt-0.5 text-[25px] font-semibold tracking-tight text-[#3d6fe0]">{r.accuracyRate.toFixed(1)}%</div>
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
            {displayDimOps.length > 0 && (
              <div className="rounded-lg border border-[#dce6f4] bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[#35414e]">二、建议调整的评分维度</span>
                  <span className="text-[10px] text-[#98a3af]">修改/删除按存疑概率从高到低</span>
                </div>
                <div className="space-y-2.5">
                  {displayDimOps.map((e, idx) => {
                    const opColor = e.op === "新增" ? "bg-[#e6f4ee] text-[#27955d]" : e.op === "删除" ? "bg-[#fdeceb] text-[#d75d5d]" : "bg-[#eef4ff] text-[#4b7ff0]";
                    return (
                      <div key={`${e.op}-${e.title}-${e.agentTypes.join("-")}`} className="rounded-md border border-[#e6edf6] bg-[#fbfcfe] p-3">
                        <div className="mb-1.5 flex items-center gap-2">
                          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#f0f2f5] text-[10px] font-semibold text-[#6b7a89]">{idx + 1}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${opColor}`}>{e.op}</span>
                          <span className="rounded bg-[#eef4ff] px-2 py-0.5 text-[11px] font-medium text-[#4b7ff0]">{e.title}</span>
                          {e.agentTypes.length > 0 && <span className="rounded-full bg-[#fff3df] px-1.5 py-0.5 text-[9px] font-medium text-[#a86d20]">{e.agentTypes.join("、")}</span>}
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
                            <span className="text-[#8794a0]">现判断标准</span>
                            <span className="leading-relaxed text-[#9aa4b0] line-through decoration-[#d0d6de]">{e.oldCriteria || "—"}</span>
                            <span className="text-[#8794a0]">建议改为</span>
                            <span className="leading-relaxed text-[#27955d]">{e.newCriteria}</span>
                          </div>
                        )}
                        {e.op === "新增" && (
                          <div className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-[10px]">
                            <span className="text-[#8794a0]">说明</span>
                            <span className="leading-relaxed text-[#4d5966]">{e.standard || "—"}</span>
                            <span className="text-[#8794a0]">判断标准</span>
                            <span className="leading-relaxed text-[#27955d]">{e.newCriteria}</span>
                          </div>
                        )}
                        {e.op === "删除" && (
                          <div className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-[10px]">
                            {(!e.typeGroups || e.typeGroups.length === 0) && <><span className="text-[#8794a0]">现判断标准</span><span className="leading-relaxed text-[#9aa4b0] line-through decoration-[#d0d6de]">{e.oldCriteria || "—"}</span></>}
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
type FakeMcpTool = { id: string; label: string; description: string };
const FAKE_MCP_TOOLS: FakeMcpTool[] = [
  { id: "recharge_query", label: "充值到账查询", description: "已对充值未到账，充值到账错误这两类客诉生效" },
  { id: "currency_item_query", label: "金币道具查询", description: "已对金币道具类客诉生效" },
  { id: "account_query", label: "账号信息查询", description: "查询账号基础信息和状态" },
  { id: "activity_eligibility_query", label: "活动资格查询", description: "查询玩家活动参与资格及发放状态" },
];

// toolId 为 undefined 时兼容没有工具字段的旧规则；null 表示管理员明确清除工具。
type Dim = { title: string; score: string; standard: string; criteria: string; scopes?: AgentType[]; variants?: Record<AgentType, string>; toolId?: string | null };
const findFakeMcpTool = (toolId?: string | null) => FAKE_MCP_TOOLS.find(tool => tool.id === toolId);
const legacyToolIdFor = (cat: Cat, dim: Dim): string | undefined => {
  if (cat.name === "充值类" && dim.title === "回复错误") return "recharge_query";
  if (cat.name === "数据查询类" && dim.title === "回答错误") return "currency_item_query";
  return undefined;
};
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
function DimScopeEditor({ draft, patch, agentTypes, viewAs, scoreControl, canConfigureTools }: {
  draft: Dim;
  patch: (p: Partial<Dim>) => void;
  agentTypes: AgentType[];
  viewAs?: AgentType | null;
  scoreControl: React.ReactNode;
  canConfigureTools?: boolean;
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
      <div className="col-span-2 grid grid-cols-[70px_minmax(0,1fr)_70px_minmax(0,1fr)_70px_minmax(0,1fr)] items-start gap-x-3">
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
      {canConfigureTools && (
        <>
          <span className="pt-1 text-[#8794a0]">选择工具</span>
          <select
            aria-label="选择规则工具"
            value={draft.toolId ?? ""}
            onChange={e => patch({ toolId: e.target.value === "" ? null : e.target.value })}
            className="h-7 w-full rounded border border-[#dbe3ee] bg-white px-2 text-[10px] text-[#3e4c5a] outline-none transition hover:border-[#c3d0e0] focus:border-[#4b7ff0]"
          >
            <option value="">未选择工具</option>
            {FAKE_MCP_TOOLS.map(tool => <option key={tool.id} value={tool.id}>{tool.label}</option>)}
          </select>
        </>
      )}
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
  agentTypes,
  viewAs,
  setViewAs,
  canConfigureTools,
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
  agentTypes: AgentType[];
  // 「按客服类型预览」：选中某类型后，列表只留对它生效的规则，判断标准也换成该类型实际加载的那份。
  viewAs?: AgentType | null;
  canConfigureTools?: boolean;
}) {
  const [menuOpenIdx, setMenuOpenIdx] = useState<number | null>(null);
  const [catNameDraft, setCatNameDraft] = useState("");
  const [tagDrafts, setTagDrafts] = useState<Record<number, string>>({});
  const [editingKey, setEditingKey] = useState<{ cat: number; dim: number } | null>(null);
  const [viewingKey, setViewingKey] = useState<{ cat: number; dim: number } | null>(null);
  const [dimDrafts, setDimDrafts] = useState<Record<string, Dim>>({});
  const [addingDim, setAddingDim] = useState<number | null>(null);
  const emptyDraft: NewDimDraft = { title: "", score: "", standard: "", criteria: "", toolId: null };
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
              {/* 现有二级维度 */}
              {/* 按客服类型预览时，只留对该类型生效的规则——用来自查「这类客服的客诉，AI 到底加载了什么」 */}
              {cat.dimensions.map((dim, dimIdx) => {
                if (viewAs && !dimApplies(dim, viewAs)) return null;
                const key = `${catIdx}-${dimIdx}`;
                const detailType = detailTypeByKey[key] ?? (viewAs && dimApplies(dim, viewAs) ? viewAs : undefined);
                const draft = dimDrafts[key];
                const isEditing = editingKey?.cat === catIdx && editingKey?.dim === dimIdx;
                const isViewing = viewingKey?.cat === catIdx && viewingKey?.dim === dimIdx;
                const effectiveToolId = dim.toolId === undefined ? legacyToolIdFor(cat, dim) : dim.toolId;
                const attachedTool = findFakeMcpTool(effectiveToolId);
                const toolLabel = attachedTool?.label ?? (effectiveToolId ? "已配置工具" : "");
                const toolDescription = attachedTool?.description ?? (effectiveToolId ? "当前规则已配置一个工具" : "");
                return (
                  <div key={dimIdx} ref={el => { dimRowRefs.current[`${catIdx}-${dimIdx}`] = el; }} className={`border-b border-[#f2f4f7] px-5 transition ${isViewing ? "bg-[#eef5ff] ring-1 ring-inset ring-[#4b7ff0]" : ""}`}>
                    {/* 维度行 */}
                    <div className="grid grid-cols-[1.6fr_2.4fr_.5fr_.55fr] items-center gap-3 py-2.5 text-[11px]">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <div className="truncate font-medium text-[#465260]">{dim.title}</div>
                          {!isViewing && !isEditing && attachedTool && (
                            <span className="group relative shrink-0">
                              <span
                                title={`${toolDescription}。已挂载工具：${toolLabel}`}
                                aria-label={`${toolDescription}。已挂载工具：${toolLabel}`}
                                className="cursor-help rounded bg-[#eaf7f0] px-1.5 py-0.5 text-[9px] font-medium text-[#27955d]"
                              >查询工具已挂载</span>
                              <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-max max-w-[240px] -translate-x-1/2 rounded bg-[#2f3b48] px-2 py-1 text-[9px] font-normal leading-4 text-white shadow-md group-hover:block">
                                {toolDescription}。已挂载工具：{toolLabel}
                              </span>
                            </span>
                          )}
                        </div>
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
                          {canConfigureTools && (
                            <>
                              <span className="text-[#8794a0]">选择工具</span>
                              <span className="text-[#465260]">{findFakeMcpTool(effectiveToolId)?.label ?? (effectiveToolId ? "已配置工具" : "未选择工具")}</span>
                            </>
                          )}
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
                            agentTypes={agentTypes} viewAs={viewAs} canConfigureTools={canConfigureTools}/>
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
                      agentTypes={agentTypes} viewAs={viewAs} canConfigureTools={canConfigureTools}/>
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

function RulesPage({ commonCats, setCommonCats, privateCats, setPrivateCats, principles, setPrinciples, knowledge, onAddKnowledge, onUpdateKnowledge, onDeleteKnowledge, agentTypes, onAddAgentType, onRenameAgentType, onDeleteAgentType, agentTypeRefCount, targetRuleName, targetEditable, onTargetConsumed, onRulesModified, showBack, onBack, readOnly, canConfigureTools, versions, latestVersion, totalSeq, isDirty, viewingVersionId, setViewingVersionId, onSaveVersion, onDiscardChanges, onRestoreVersion }: {
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
  canConfigureTools: boolean;
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
          <RulesList label="通用规则" sublabel="适用于全部客服会话的基础质检要求" cats={shownCommon} setCats={isPreview ? setPreviewCommon : setCommonCats} targetRuleName={tab === "common" && !isPreview ? targetRuleName : null} targetEditable={targetEditable} onTargetConsumed={onTargetConsumed} onRulesModified={onRulesModified} readOnly={!canEdit} agentTypes={agentTypes} viewAs={viewAs} canConfigureTools={canConfigureTools}/>
        ) : tab === "private" ? (
          <RulesList label="专用规则" sublabel="仅对指定业务线、活动或场景生效" showTags cats={shownPrivate} setCats={isPreview ? setPreviewPrivate : setPrivateCats} targetRuleName={tab === "private" && !isPreview ? targetRuleName : null} targetEditable={targetEditable} onTargetConsumed={onTargetConsumed} onRulesModified={onRulesModified} readOnly={!canEdit} agentTypes={agentTypes} viewAs={viewAs} canConfigureTools={canConfigureTools}/>
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

type AgentQualityFilter = "all" | "deducted" | "manualPending" | "appealPending";

const effectiveStatusMeta = (result: EffectiveQualityResult) => {
  if (result.publicationStatus === "manualPending") return { label: "结果核定中", tone: "bg-[#fff5e8] text-[#b9791d]", source: "人工复检中" };
  if (result.publicationStatus === "appealPending") return { label: "申诉处理中", tone: "bg-[#eef4ff] text-[#4b7ff0]", source: result.baseSource === "manual" ? "人工核定" : "AI 质检" };
  if (result.source === "appeal") return result.appeal?.status === "accepted"
    ? { label: "申诉已采纳", tone: "bg-[#eaf7f0] text-[#27955d]", source: "申诉核定" }
    : { label: "申诉已驳回", tone: "bg-[#f0f2f5] text-[#687789]", source: "原结果生效" };
  if (result.source === "manual") return { label: "人工已核定", tone: "bg-[#eaf7f0] text-[#27955d]", source: "人工核定" };
  return { label: "已出结果", tone: "bg-[#eef4ff] text-[#4b7ff0]", source: "AI 质检" };
};

const qualityScoreColor = (score: number) => score >= 90 ? "text-[#27955d]" : score >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]";

// 客服只能对尚未申诉、且直接由 AI 或人工核定产生的结果发起一次申诉。
const canAgentAppeal = (result: EffectiveQualityResult) =>
  result.visibleToAgent
  && (result.source === "ai" || result.source === "manual")
  && !result.appeal;

function AgentQualityPage({ currentUser, complaints, effectiveResults, onSubmitAppeal }: { currentUser: Account; complaints: Complaint[]; effectiveResults: EffectiveQualityResult[]; onSubmitAppeal: (complaintId: string, objectedRules: string[], reason: string) => void }) {
  const [filter, setFilter] = useState<AgentQualityFilter>("all");
  const [openComplaintId, setOpenComplaintId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [appealReason, setAppealReason] = useState("");
  const [appealError, setAppealError] = useState("");
  const agentResults = effectiveResults
    .filter(result => complaints.find(item => item.id === result.complaintId)?.agent === currentUser.name)
    .sort((a, b) => b.date.localeCompare(a.date) || b.complaintId.localeCompare(a.complaintId));
  const published = agentResults.filter(item => item.visibleToAgent);
  const averageScore = published.length ? published.reduce((sum, item) => sum + item.effectiveScore, 0) / published.length : 0;
  const pendingManual = agentResults.filter(item => item.publicationStatus === "manualPending").length;
  const pendingAppeals = agentResults.filter(item => item.publicationStatus === "appealPending").length;
  const filtered = agentResults.filter(result => filter === "all"
    || (filter === "deducted" && result.visibleToAgent && result.effectiveScore < 100)
    || (filter === "manualPending" && result.publicationStatus === "manualPending")
    || (filter === "appealPending" && result.publicationStatus === "appealPending"));
  const complaint = openComplaintId ? complaints.find(item => item.id === openComplaintId) ?? null : null;
  const result = openComplaintId ? agentResults.find(item => item.complaintId === openComplaintId) ?? null : null;

  function openAppeal() {
    if (!result || !canAgentAppeal(result)) return;
    setSelectedRules(result.effectiveIssues.map(item => item.rule));
    setAppealReason("");
    setAppealError("");
    setAppealOpen(true);
  }

  function submitAppeal() {
    if (!result || !canAgentAppeal(result)) { setAppealError("该结果已提交过申诉或当前不可申诉"); return; }
    if (result.effectiveIssues.length > 0 && selectedRules.length === 0) { setAppealError("请选择至少一个有异议的扣分项"); return; }
    if (!appealReason.trim()) { setAppealError("请填写申诉理由，便于质检人员复核"); return; }
    onSubmitAppeal(result.complaintId, selectedRules, appealReason);
    setAppealOpen(false);
  }

  if (complaint && result && result.visibleToAgent) {
    const status = effectiveStatusMeta(result);
    const manualScore = result.manualReview ? reviewFinalScore(complaint, result.manualReview) : result.aiScore;
    const removedIssues = result.aiIssues.filter(issue => !result.effectiveIssues.some(item => item.rule === issue.rule));
    const canAppeal = canAgentAppeal(result);
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
        <header className="flex min-h-[58px] items-center gap-3 border-b border-[#e2e6eb] bg-white px-5 py-3">
          <button onClick={() => { setOpenComplaintId(null); setAiOpen(false); }} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]"><ChevronRight className="size-3 rotate-180" />返回我的质检</button>
          <div><h1 className="text-[15px] font-semibold text-[#2f3b48]">质检结果详情</h1><p className="mt-0.5 text-[10px] text-[#8b96a3]">客诉 {complaint.id} · 玩家 {complaint.user} · {result.date}</p></div>
          <span className={`ml-auto rounded-full px-2 py-1 text-[9px] font-medium ${status.tone}`}>{status.label}</span>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-5"><div className="mx-auto max-w-[760px] space-y-3">
          {result.publicationStatus === "appealPending" && <div className="flex items-start gap-2 rounded-lg border border-[#dbe6f6] bg-[#f6f9ff] px-3.5 py-3 text-[10px] text-[#536a89]"><Clock className="mt-0.5 size-3.5 shrink-0 text-[#4b7ff0]" /><div><strong className="font-semibold text-[#3562c8]">申诉处理中</strong><p className="mt-0.5 leading-relaxed">当前仍展示提交申诉时的有效结果，质检人员处理完成后会自动更新最终分数。</p></div></div>}
          {result.source === "appeal" && result.appeal && <div className={`rounded-lg border px-3.5 py-3 ${result.appeal.status === "accepted" ? "border-[#cfe7da] bg-[#f4fbf7]" : "border-[#e1e6eb] bg-white"}`}><div className="flex items-center gap-2 text-[11px] font-semibold text-[#374350]">{result.appeal.status === "accepted" ? <Check className="size-4 text-[#27955d]" /> : <ShieldCheck className="size-4 text-[#687789]" />}{result.appeal.status === "accepted" ? "申诉已采纳" : "申诉已驳回"}</div><p className="mt-1.5 text-[10px] leading-relaxed text-[#687789]">{result.appeal.customerMessage || result.appeal.reviewerOpinion || "质检人员已完成本次申诉复核。"}</p><div className="mt-2 text-[9px] text-[#98a3af]">{result.appeal.reviewerName} · {result.appeal.reviewedAt}</div></div>}
          <section className="rounded-lg border border-[#dbe6f6] bg-white p-4">
            <div className="flex items-start justify-between gap-4"><div><div className="text-[11px] font-semibold text-[#3562c8]">当前有效质检结果</div><div className="mt-1 text-[10px] text-[#8b97a3]">{status.source}{result.source === "manual" ? ` · ${result.manualReview?.agreed ? "维持 AI 结论" : "人工调整"}` : ""}</div></div><div className="text-right"><div className={`text-[36px] font-bold leading-none ${qualityScoreColor(result.effectiveScore)}`}>{result.effectiveScore}</div><div className="mt-1 text-[9px] text-[#98a3af]">满分 100</div></div></div>
            {(result.source === "manual" || result.baseSource === "manual") && result.manualReview && <div className="mt-3 rounded-md bg-[#f6f9ff] px-3 py-2.5"><div className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-[#4d82f6] text-[10px] font-semibold text-white">{(result.manualReview.reviewerName ?? "质").slice(0, 1)}</span><div><div className="text-[10px] font-medium text-[#465260]">{result.manualReview.reviewerName ?? "质检人员"} · 人工核定</div><div className="text-[9px] text-[#98a3af]">{result.manualReview.reviewedAt}</div></div><span className="ml-auto text-[9px] text-[#687789]">AI {result.aiScore} 分 {manualScore !== result.aiScore ? `→ 人工 ${manualScore} 分` : "· 维持原判"}</span></div>{(result.manualReview.agentNote || result.manualReview.detail) && <p className="mt-2 text-[10px] leading-relaxed text-[#687789]">{result.manualReview.agentNote || result.manualReview.detail}</p>}</div>}
          </section>
          <section className="rounded-lg border border-[#e1e6eb] bg-white p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-[11px] font-semibold text-[#374350]">当前生效扣分</h2><p className="mt-0.5 text-[9px] text-[#98a3af]">只展示目前仍计入分数的扣分项</p></div>{result.effectiveIssues.length > 0 && <span className="rounded-full bg-[#fff0f0] px-2 py-1 text-[9px] text-[#d75d5d]">{result.effectiveIssues.length} 项</span>}</div>
            {result.effectiveIssues.length === 0 ? <div className="rounded-md bg-[#f4fbf7] px-3 py-3 text-[10px] text-[#27955d]">当前有效结果无扣分项。</div> : <div className="space-y-2">{result.effectiveIssues.map((issue, index) => <div key={`${issue.rule}-${index}`} className="rounded-md bg-[#fafbfc] px-3 py-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-medium text-[#465260]">{issue.rule}</span><span className="rounded bg-[#fff0f0] px-1.5 py-0.5 text-[9px] text-[#d75d5d]">{issue.score}</span></div><p className="mt-1 text-[10px] leading-relaxed text-[#758291]">{issue.quote}</p></div>)}</div>}
            {removedIssues.length > 0 && <div className="mt-3 rounded-md bg-[#f4fbf7] px-3 py-2.5"><div className="text-[9px] font-medium text-[#27955d]">已撤销扣分</div><div className="mt-1 flex flex-wrap gap-1.5">{removedIssues.map(item => <span key={item.rule} className="rounded bg-white px-2 py-1 text-[9px] text-[#687789] line-through">{item.rule} {item.score}</span>)}</div></div>}
          </section>
          <section className="rounded-lg border border-[#e1e6eb] bg-white p-4"><button onClick={() => setAiOpen(value => !value)} className="flex w-full items-center justify-between text-left"><div><h2 className="text-[11px] font-semibold text-[#374350]">AI 判分依据</h2><p className="mt-0.5 text-[9px] text-[#98a3af]">查看 AI 初判分数、扣分项和原句证据</p></div><ChevronRight className={`size-4 text-[#98a3af] transition-transform ${aiOpen ? "rotate-90" : ""}`} /></button>{aiOpen && <div className="mt-3 border-t border-[#edf0f3] pt-3"><div className="mb-2 text-[10px] text-[#687789]">AI 初判 <strong className={qualityScoreColor(result.aiScore)}>{result.aiScore} 分</strong></div>{result.aiIssues.length === 0 ? <div className="text-[10px] text-[#98a3af]">AI 未发现扣分项。</div> : <div className="space-y-1.5">{result.aiIssues.map((issue, index) => <div key={`${issue.rule}-${index}`} className="flex items-start gap-2 rounded bg-[#fafbfc] px-2.5 py-2 text-[10px]"><span className="shrink-0 rounded bg-[#fff0f0] px-1.5 py-0.5 text-[9px] text-[#d75d5d]">{issue.rule} {issue.score}</span><span className="leading-relaxed text-[#758291]">{issue.quote}</span></div>)}</div>}</div>}</section>
          <section className="rounded-lg border border-[#e1e6eb] bg-white p-4"><h2 className="mb-3 text-[11px] font-semibold text-[#374350]">对话记录</h2><div className="space-y-2">{complaint.chat.map((message, index) => <div key={index} className={`flex ${message.from === "agent" ? "justify-end" : "justify-start"}`}><div className={`max-w-[78%] rounded-lg px-3 py-2 text-[10px] leading-relaxed ${message.from === "agent" ? "bg-[#eaf2ff] text-[#33465e]" : "bg-[#f2f4f7] text-[#4d5966]"}`}><div className="mb-0.5 text-[9px] text-[#9aa4b0]">{message.from === "agent" ? "客服（你）" : "玩家"} · {message.time}</div>{message.text}</div></div>)}</div></section>
          <div className="flex items-center justify-between rounded-lg border border-[#e1e6eb] bg-white px-4 py-3"><div><div className="text-[10px] font-medium text-[#465260]">对当前核定结果有异议？</div><div className="mt-0.5 text-[9px] text-[#98a3af]">申诉会直接提交给质检人员复核</div></div>{canAppeal ? <button onClick={openAppeal} className="rounded-md bg-[#4b7ff0] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#3d6fe0]">发起申诉</button> : <span className="text-[9px] text-[#98a3af]">{result.publicationStatus === "appealPending" ? "申诉处理中" : result.appeal ? "本次申诉已处理" : "当前无可申诉扣分项"}</span>}</div>
        </div></div>
        {appealOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-[#1f2a36]/35 p-4"><div className="w-full max-w-[480px] rounded-xl border border-[#dce4ef] bg-white p-5 shadow-[0_20px_60px_rgba(31,42,54,.22)]"><div className="flex items-start justify-between"><div><h2 className="text-[14px] font-semibold text-[#2f3b48]">提交质检申诉</h2><p className="mt-1 text-[10px] text-[#8b97a3]">{result.effectiveIssues.length > 0 ? "请选择有异议的扣分项，并说明判定不合理的原因。" : "当前没有扣分项，可直接说明对整体质检结果的异议。"}</p></div><button onClick={() => setAppealOpen(false)} className="text-[#98a3af] hover:text-[#465260]"><X className="size-4" /></button></div><div className="mt-4"><div className="mb-2 text-[10px] font-medium text-[#465260]">争议扣分项</div>{result.effectiveIssues.length > 0 ? <div className="flex flex-wrap gap-2">{result.effectiveIssues.map(issue => { const selected = selectedRules.includes(issue.rule); return <button key={issue.rule} onClick={() => { setSelectedRules(prev => selected ? prev.filter(item => item !== issue.rule) : [...prev, issue.rule]); setAppealError(""); }} className={`rounded-md border px-2.5 py-1.5 text-[10px] ${selected ? "border-[#8eacf3] bg-[#eef4ff] text-[#3562c8]" : "border-[#dce4ef] bg-white text-[#687789]"}`}>{selected && <Check className="mr-1 inline size-3" />}{issue.rule} {issue.score}</button>; })}</div> : <div className="rounded-md bg-[#f6f9ff] px-3 py-2.5 text-[10px] text-[#687789]">当前结果为满分或无扣分项，可直接填写整体结果申诉理由。</div>}</div><div className="mt-4"><label className="mb-1.5 block text-[10px] font-medium text-[#465260]">申诉理由</label><textarea value={appealReason} onChange={event => { setAppealReason(event.target.value); setAppealError(""); }} rows={5} placeholder="请结合实际处理过程说明，例如已完成了哪些操作、AI 忽略了什么上下文……" className="w-full resize-none rounded-md border border-[#dce4ef] px-3 py-2 text-[10px] leading-relaxed outline-none focus:border-[#4b7ff0]" /></div>{appealError && <div className="mt-2 text-[10px] text-[#d75d5d]">{appealError}</div>}<div className="mt-4 flex justify-end gap-2"><button onClick={() => setAppealOpen(false)} className="rounded-md border border-[#dce4ef] px-3 py-1.5 text-[10px] text-[#687789] hover:bg-[#f7f9fc]">取消</button><button onClick={submitAppeal} className="rounded-md bg-[#4b7ff0] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#3d6fe0]">确认提交</button></div></div></div>}
      </div>
    );
  }

  const filters: { key: AgentQualityFilter; label: string; count: number }[] = [
    { key: "all", label: "全部记录", count: agentResults.length },
    { key: "deducted", label: "有扣分", count: agentResults.filter(item => item.visibleToAgent && item.effectiveScore < 100).length },
    { key: "manualPending", label: "结果核定中", count: pendingManual },
    { key: "appealPending", label: "申诉处理中", count: pendingAppeals },
  ];
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex min-h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5 py-3"><div><h1 className="text-[15px] font-semibold text-[#2f3b48]">我的质检</h1><p className="mt-0.5 text-[10px] text-[#8b96a3]">查看已发布的质检结果、扣分依据与核定进度</p></div><span className="rounded-full bg-[#eef4ff] px-2 py-1 text-[9px] text-[#4b7ff0]">{currentUser.name} · {currentUser.group}</span></header>
      <div className="min-h-0 flex-1 overflow-auto p-5"><div className="mx-auto max-w-[1080px] space-y-3">
        <section className="grid overflow-hidden rounded-lg border border-[#dce6f4] bg-white sm:grid-cols-4"><div className="px-4 py-3"><div className="text-[9px] text-[#8b97a3]">当前核定平均分</div><div className={`mt-1 text-[22px] font-bold ${qualityScoreColor(averageScore)}`}>{published.length ? averageScore.toFixed(1) : "—"}</div></div><div className="border-t border-[#edf0f3] px-4 py-3 sm:border-l sm:border-t-0"><div className="text-[9px] text-[#8b97a3]">已出结果</div><div className="mt-1 text-[20px] font-bold text-[#33465e]">{published.length}</div></div><div className="border-t border-[#edf0f3] px-4 py-3 sm:border-l sm:border-t-0"><div className="text-[9px] text-[#8b97a3]">结果核定中</div><div className="mt-1 text-[20px] font-bold text-[#b9791d]">{pendingManual}</div></div><div className="border-t border-[#edf0f3] px-4 py-3 sm:border-l sm:border-t-0"><div className="text-[9px] text-[#8b97a3]">申诉处理中</div><div className="mt-1 text-[20px] font-bold text-[#4b7ff0]">{pendingAppeals}</div></div></section>
        <section className="overflow-hidden rounded-lg border border-[#e1e6eb] bg-white"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e9edf0] px-4 py-3"><div><h2 className="text-[12px] font-semibold text-[#374350]">质检记录</h2><p className="mt-0.5 text-[9px] text-[#98a3af]">人工核定中的客诉暂不公开分数与判分依据</p></div><div className="flex flex-wrap gap-1">{filters.map(item => <button key={item.key} onClick={() => setFilter(item.key)} className={`rounded-md px-2.5 py-1.5 text-[9px] ${filter === item.key ? "bg-[#4b7ff0] font-medium text-white" : "bg-[#f2f4f7] text-[#687789] hover:bg-[#e9eef5]"}`}>{item.label} {item.count}</button>)}</div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-[10px]"><thead className="bg-[#fafbfc] text-left text-[#8b97a3]"><tr><th className="px-4 py-2.5 font-normal">日期 / 客诉</th><th className="px-4 py-2.5 font-normal">玩家</th><th className="px-4 py-2.5 font-normal">状态</th><th className="px-4 py-2.5 font-normal">结果来源</th><th className="px-4 py-2.5 text-right font-normal">当前得分</th><th className="px-4 py-2.5 text-right font-normal">操作</th></tr></thead><tbody>{filtered.map(item => { const rowComplaint = complaints.find(row => row.id === item.complaintId); const status = effectiveStatusMeta(item); const pending = item.publicationStatus === "manualPending"; return <tr key={item.complaintId} className="border-t border-[#edf0f3] hover:bg-[#f8fbff]"><td className="px-4 py-3"><div className="font-medium text-[#465260]">{item.complaintId}</div><div className="mt-0.5 text-[9px] text-[#98a3af]">{item.date}</div></td><td className="px-4 py-3 text-[#687789]">{rowComplaint?.user ?? "—"}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[9px] ${status.tone}`}>{status.label}</span></td><td className="px-4 py-3 text-[#687789]">{status.source}</td><td className={`px-4 py-3 text-right text-[14px] font-bold ${pending ? "text-[#b0bbc8]" : qualityScoreColor(item.effectiveScore)}`}>{pending ? "—" : item.effectiveScore}</td><td className="px-4 py-3 text-right">{pending ? <span className="text-[9px] text-[#a0acb8]">暂不可查看</span> : <button onClick={() => setOpenComplaintId(item.complaintId)} className="text-[10px] font-medium text-[#4b7ff0] hover:underline">{item.publicationStatus === "appealPending" ? "查看进度" : "查看详情"}</button>}</td></tr>; })}{filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-[10px] text-[#a0acb8]">当前筛选下暂无记录</td></tr>}</tbody></table></div>
        </section>
      </div></div>
    </div>
  );
}

function AgentAppealsPage({ currentUser, complaints, appeals, onMarkRead }: { currentUser: Account; complaints: Complaint[]; appeals: Record<string, AgentAppealState>; onMarkRead: (agent: string) => void }) {
  const [tab, setTab] = useState<"pending" | "processed">(() => Object.values(appeals).some(item => item.agent === currentUser.name && item.status === "pending") ? "pending" : "processed");
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { onMarkRead(currentUser.name); }, [currentUser.name]);
  const records = Object.values(appeals).filter(item => item.agent === currentUser.name).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const pending = records.filter(item => item.status === "pending");
  const processed = records.filter(item => item.status !== "pending");
  const shown = tab === "pending" ? pending : processed;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex min-h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5 py-3"><div><h1 className="text-[15px] font-semibold text-[#2f3b48]">我的申诉</h1><p className="mt-0.5 text-[10px] text-[#8b96a3]">查看已提交申诉的处理进度与最终回复</p></div><span className="text-[9px] text-[#98a3af]">共 {records.length} 条</span></header>
      <div className="min-h-0 flex-1 overflow-auto p-5"><div className="mx-auto max-w-[960px] space-y-3"><div className="inline-flex rounded-lg bg-[#e9edf3] p-1"><button onClick={() => { setTab("pending"); setOpenId(null); }} className={`rounded-md px-3 py-1.5 text-[10px] ${tab === "pending" ? "bg-white font-medium text-[#3562c8] shadow-sm" : "text-[#687789]"}`}>处理中 {pending.length}</button><button onClick={() => { setTab("processed"); setOpenId(null); }} className={`rounded-md px-3 py-1.5 text-[10px] ${tab === "processed" ? "bg-white font-medium text-[#3562c8] shadow-sm" : "text-[#687789]"}`}>已处理 {processed.length}</button></div>
        <section className="overflow-hidden rounded-lg border border-[#e1e6eb] bg-white">{shown.length === 0 ? <div className="px-4 py-12 text-center text-[10px] text-[#a0acb8]">{tab === "pending" ? "暂无处理中的申诉" : "暂无已处理申诉"}</div> : shown.map(appeal => { const complaint = complaints.find(item => item.id === appeal.complaintId); const opened = openId === appeal.id; const accepted = appeal.status === "accepted"; return <article key={appeal.id} className="border-b border-[#edf0f3] last:border-b-0"><button onClick={() => setOpenId(opened ? null : appeal.id)} className="grid w-full grid-cols-[1.1fr_1fr_.8fr_.8fr_28px] items-center gap-3 px-4 py-3 text-left hover:bg-[#f8fbff]"><div><div className="text-[10px] font-medium text-[#465260]">{appeal.complaintId}</div><div className="mt-0.5 text-[9px] text-[#98a3af]">玩家 {complaint?.user ?? "—"}</div></div><div className="truncate text-[10px] text-[#687789]">{appeal.objectedRules.join("、")}</div><div className="text-[9px] text-[#98a3af]">{appeal.submittedAt}</div><div>{appeal.status === "pending" ? <span className="rounded-full bg-[#eef4ff] px-2 py-1 text-[9px] text-[#4b7ff0]">申诉处理中</span> : <span className={`rounded-full px-2 py-1 text-[9px] ${accepted ? "bg-[#eaf7f0] text-[#27955d]" : "bg-[#f0f2f5] text-[#687789]"}`}>{accepted ? "已采纳" : "已驳回"}</span>}</div><ChevronRight className={`size-4 text-[#a0acb8] transition-transform ${opened ? "rotate-90" : ""}`} /></button>{opened && <div className="border-t border-[#edf0f3] bg-[#fafbfc] px-4 py-4"><div className="grid gap-3 md:grid-cols-2"><div className="rounded-md bg-white p-3"><div className="text-[9px] text-[#98a3af]">我的申诉理由</div><p className="mt-1.5 whitespace-pre-wrap text-[10px] leading-relaxed text-[#5f6b78]">{appeal.reason}</p></div><div className="rounded-md bg-white p-3"><div className="text-[9px] text-[#98a3af]">质检处理结果</div>{appeal.status === "pending" ? <p className="mt-1.5 text-[10px] leading-relaxed text-[#687789]">质检人员正在核对判分依据，处理完成后会在这里显示最终结论。</p> : <><div className="mt-1.5 flex items-center gap-2 text-[10px]"><span className="text-[#98a3af]">申诉时 {appeal.submittedScore} 分</span><ChevronRight className="size-3 text-[#a0acb8]" /><strong className={accepted ? "text-[#27955d]" : "text-[#687789]"}>核定后 {accepted ? appeal.reviewerScore ?? appeal.submittedScore : appeal.submittedScore} 分</strong></div><p className="mt-2 text-[10px] leading-relaxed text-[#5f6b78]">{appeal.customerMessage || appeal.reviewerOpinion || "质检人员已完成处理。"}</p><div className="mt-2 text-[9px] text-[#98a3af]">{appeal.reviewerName} · {appeal.reviewedAt}</div></>}</div></div></div>}</article>; })}</section>
      </div></div>
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

  function fillAgentDemo() {
    setAuthView("login");
    setRole("agent");
    setName("李梦");
    setPassword("123456");
    setError("");
  }

  return (
    <div className="grid min-h-0 flex-1 place-items-center bg-[#f7f8fa] p-6">
      <div className="w-full max-w-[300px]">
        <div className="mb-5 flex flex-col items-center">
          <div className="mb-2 grid size-10 place-items-center rounded-lg bg-[#4d82f6] text-[18px] font-bold text-white">Q</div>
          <div className="text-[14px] font-semibold text-[#2f3b48]">质检助手</div>
          <div className="text-[10px] text-[#8b96a3]">{isRegister ? "创建账号" : "登录你的账号"}</div>
        </div>

        {!isRegister && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-[#dbe6f6] bg-[#f6f9ff] px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-[10px] font-medium text-[#3562c8]">客服演示账号</div>
              <div className="mt-0.5 text-[9px] text-[#8090a5]">李梦 · 123456 · 含多种质检状态</div>
            </div>
            <button onClick={fillAgentDemo} className="shrink-0 rounded-md bg-white px-2 py-1.5 text-[9px] font-medium text-[#4b7ff0] shadow-sm ring-1 ring-[#cddcf5] hover:bg-[#eef5ff]">一键填充</button>
          </div>
        )}

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

export default function App() {
  const [view, setView] = useState<View>("quality");
  const [trendDate, setTrendDate] = useState("2024-10-11");
  const [sentimentDate, setSentimentDate] = useState("2024-10-11");
  const [appealEntrySource, setAppealEntrySource] = useState<"daily" | "sidebar">("sidebar");
  const [qualityEntrySource, setQualityEntrySource] = useState<"daily" | "sidebar">("sidebar");
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
    { name: "李梦", password: "123456", role: "agent", group: "一线客服" },
    { name: "王浩", password: "123456", role: "agent", group: "VIP一线客服" },
    { name: "陈静", password: "123456", role: "agent", group: "高潜客服" },
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
  const [agentAppeals, setAgentAppeals] = useState<Record<string, AgentAppealState>>(SEED_AGENT_APPEALS);
  const [dashboardUpdateNotice, setDashboardUpdateNotice] = useState<DashboardUpdateNotice | null>(null);
  const [dashboardLastUpdatedAt, setDashboardLastUpdatedAt] = useState("10:58");
  const dashboardUpdateSeq = useRef(1);
  const [complaints, setComplaints] = useState<Complaint[]>(COMPLAINTS);
  const effectiveResults = deriveEffectiveQualityResults(complaints, reviews, agentAppeals);
  const appealRecords = buildAppealRecords(complaints, agentAppeals);
  const pendingAppeals = appealRecords.filter(item => item.status === "待处理").length;
  const currentAgentAppeals = currentUser?.role === "agent"
    ? Object.values(agentAppeals).filter(item => item.agent === currentUser.name)
    : [];
  const agentAppealBadge = currentAgentAppeals.filter(item => item.status === "pending" || !item.seenByAgent).length;
  const pendingManualReviews = HUMAN_REVIEW_QUEUE.filter(item => {
    const review = reviews[item.complaintId];
    return !review || review.source !== "manual" || (!review.agreed && !review.submitted);
  }).length;
  // 质检任务：提升到 App 层，供「任务管理」与「查看报告」共用同一份真源。
  const [tasks, setTasks] = useState<TaskRow[]>(SEED_TASKS);
  // 已生成并保存的复审报告（仅超级管理员可见与操作）。
  const [reports, setReports] = useState<SavedReport[]>(SEED_REPORTS);
  const [aiVersion, setAiVersion] = useState(1);
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
    setDashboardUpdateNotice(null);
    setTrendDate("2024-10-11");
    setSentimentDate("2024-10-11");
    setAuthView("login");
  }
  function notifyDashboardUpdate(message: string) {
    const at = nowStamp.slice(11, 16);
    setDashboardLastUpdatedAt(at);
    setDashboardUpdateNotice({ id: dashboardUpdateSeq.current++, message, at });
  }
  function processAppeal(complaintId: string, accepted: boolean, reviewerScore: number, reviewerOpinion: string, customerMessage: string) {
    setAgentAppeals(prev => {
      const appeal = prev[complaintId];
      if (!appeal) return prev;
      return {
        ...prev,
        [complaintId]: {
          ...appeal,
          status: accepted ? "accepted" : "rejected",
          reviewerName: currentUser?.name ?? "质检人员",
          reviewedAt: nowStamp,
          reviewerScore: accepted ? reviewerScore : appeal.submittedScore,
          reviewerOpinion,
          customerMessage,
          seenByAgent: false,
        },
      };
    });
    const appealComplaint = complaints.find(item => item.id === complaintId);
    notifyDashboardUpdate(accepted
      ? `已同步申诉复核结果，${appealComplaint?.agent ?? "该客服"}的相关指标已实时调整`
      : `已同步申诉驳回结果，${appealComplaint?.agent ?? "该客服"}的原判结果继续生效`);
  }
  function submitAgentAppeal(complaintId: string, objectedRules: string[], reason: string) {
    if (!currentUser || currentUser.role !== "agent" || agentAppeals[complaintId]) return;
    const complaint = complaints.find(item => item.id === complaintId);
    if (!complaint || complaint.agent !== currentUser.name) return;
    const result = effectiveResults.find(item => item.complaintId === complaintId);
    if (!result || !canAgentAppeal(result)) return;
    setAgentAppeals(prev => ({
      ...prev,
      [complaintId]: {
        id: `appeal-${complaintId}-${dashboardUpdateSeq.current++}`,
        complaintId,
        agent: currentUser.name,
        submittedScore: result.effectiveScore,
        objectedRules,
        reason: reason.trim(),
        submittedAt: nowStamp,
        status: "pending",
        baseSource: result.baseSource,
        seenByAgent: true,
      },
    }));
  }
  function markAgentAppealsRead(agent: string) {
    setAgentAppeals(prev => Object.fromEntries(Object.entries(prev).map(([id, appeal]) => [
      id,
      appeal.agent === agent && appeal.status !== "pending" ? { ...appeal, seenByAgent: true } : appeal,
    ])));
  }
  function goToRule(name: string, editable: boolean) {
    setTargetRuleName(name);
    setTargetEditable(editable);
    setBackToQuality(true);
    setView("rules");
  }
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
          const ops = buildDimOps(rows, reviews, commonCats, privateCats, agentTypes);
          const agreedCount = rows.filter(c => reviews[c.id]?.agreed).length;
          const objectionCount = rows.filter(c => { const rv = reviews[c.id]; return !!rv && !rv.agreed && rv.submitted; }).length;
          const result: ReportResult = {
            complaintCount: rows.length,
            totalScore: rows.reduce((sum, c) => sum + c.score, 0),
            agreedCount,
            objectionCount,
            accuracyRate: rows.length > 0 ? Math.round((agreedCount / rows.length) * 1000) / 10 : 0,
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
      totalScore: 0, accuracyRate: 0, complaintCount: 0, agreedCount: 0, objectionCount: 0, dimOps: [], principleOps: [],
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

  // 记录一条历史总结反馈埋点。把反馈发生时的完整定位信息一并固化：谁、什么角色、在哪个任务下
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
          // 所有客服类型均适用，且共用同一判断标准，报告中统一标记为「全部客服」。
          title: "安抚不到位",
          score: "-2",
          standard: "玩家带情绪时是否有针对性安抚",
          criteria: "不扣：有安抚、情绪与事实分开处理；-2：完全未安抚或安抚过于简单敷衍。不适用：玩家全程情绪平稳、纯咨询",
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
      tags: ["充值类", "付费咨询", "充值未到账", "无法充值", "充值问题", "充值到账错误"],
      knowledgeIds: ["k3"],
      dimensions: [
        { title: "精准答疑", score: "-5", standard: "是否直接命中充值相关疑问、结论明确", criteria: "不扣：直接命中疑问、结论明确，玩家无需追问；或已跟进/已提交工单/已查询告知/权限外如实告知；-2：答了核心但夹带无关文案/表述绕/需再追问一次；-5：只复述文案、模板话术敷衍、答非所问或对核心疑问完全无任何跟进与回应。" },
        { title: "主动服务与延伸", score: "-2", standard: "是否主动关怀充值玩家、给出延伸服务", criteria: "-2：有明显关怀延伸点却未提。不适用：纯机制确认无后续可关怀。" },
        { title: "回复错误", score: "-3", standard: "充值机制/到账/渠道等事实性解答是否正确", criteria: "-3：对充值机制、到账规则、渠道/版本区分、数据查询等作出事实性错误解答。已查询并如实告知结果的，即便玩家不认可，也不算回复错误。", toolId: "recharge_query" },
        { title: "流程问题", score: "-3", standard: "充值问题处理流程是否规范", criteria: "-3：处理流程错误或缺失（如未按扣款/到账核实流程提交工单、记录反馈）。无固定流程场景标「本场景无流程要求」不扣。" },
        { title: "回复不全面", score: "-2", standard: "是否肯定玩家投入并给出具象建议", criteria: "-2：仅空泛安慰、未肯定老玩家投入、未给具象化建议或引导不完整。" },
      ],
    },
    {
      name: "数据查询类",
      expanded: false,
      enabled: true,
      renaming: false,
      tags: ["金币道具"],
      dimensions: [
        {
          title: "回答错误",
          score: "-3",
          standard: "-3：经工具校验后客服没有按照查询到的数据回复用户，存在数据回答错误的问题。",
          criteria: "-3：经工具校验后客服没有按照查询到的数据回复用户，存在数据回答错误的问题。",
          toolId: "currency_item_query",
        },
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
        {currentUser && <PluginSidebar view={view} setView={(v) => { setBackToQuality(false); if (v === "appeals") setAppealEntrySource("sidebar"); if (v === "quality") setQualityEntrySource("sidebar"); setView(v); }} currentUser={currentUser} pendingFeedback={summaryFeedbacks.length} pendingAppeals={pendingAppeals} pendingManualReviews={pendingManualReviews} agentAppealBadge={agentAppealBadge} onLogout={logout} />}
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
            <AgentQualityPage currentUser={currentUser} complaints={complaints} effectiveResults={effectiveResults} onSubmitAppeal={submitAgentAppeal} />
          ) : view === "agentAppeals" ? (
            <AgentAppealsPage currentUser={currentUser} complaints={complaints} appeals={agentAppeals} onMarkRead={markAgentAppealsRead} />
          ) : view === "daily" ? (
            <DailyQualityDashboard onOpenTrend={(date) => { setTrendDate(date); setView("trend"); }} onOpenAppeals={() => { setAppealEntrySource("daily"); setView("appeals"); }} onOpenManualReviews={() => { setQualityEntrySource("daily"); setView("quality"); }} onOpenRecords={(date) => { setTrendDate(date); setView("aiRecords"); }} onOpenSentiment={(date) => { setSentimentDate(date); setView("sentiment"); }} appealRecords={appealRecords} complaints={complaints} reviews={reviews} effectiveResults={effectiveResults} dashboardUpdateNotice={dashboardUpdateNotice} dashboardLastUpdatedAt={dashboardLastUpdatedAt} onConsumeDashboardUpdate={() => setDashboardUpdateNotice(null)} />
          ) : view === "aiRecords" ? (
            <AIQualityRecordsPage initialDate={trendDate} onBack={() => setView("daily")} complaints={complaints} effectiveResults={effectiveResults} />
          ) : view === "appeals" ? (
            <AppealProcessingPage onBack={appealEntrySource === "daily" ? () => setView("daily") : undefined} records={appealRecords} complaints={complaints} onProcess={processAppeal} />
          ) : view === "sentiment" ? (
            <PlayerSentimentAnalysisPage initialDate={sentimentDate} onBack={() => setView("daily")} />
          ) : view === "trend" ? (
            <TrendAnalysisPage initialDate={trendDate} onBack={() => setView("daily")} appealRecords={appealRecords} effectiveResults={effectiveResults} />
          ) : view === "quality" ? (
            <HumanReviewQueue commonCats={commonCats} privateCats={privateCats} complaints={complaints} openComplaintId={openComplaintId} setOpenComplaintId={setOpenComplaintId} reviews={reviews} setReviews={setReviews} onGoToRuleView={(name) => goToRule(name, false)} canFeedback={currentUser.role !== "admin"} onSummaryFeedback={recordSummaryFeedback} onDashboardUpdate={notifyDashboardUpdate} currentUserName={currentUser.name} reviewedAt={nowStamp} onBackToDaily={qualityEntrySource === "daily" ? () => { setView("daily"); setQualityEntrySource("sidebar"); } : undefined} />
          ) : view === "feedback" && currentUser.role === "admin" ? (
            <SummaryFeedbackPage feedbacks={summaryFeedbacks} />
          ) : view === "reports" && currentUser.role === "admin" ? (
            <ReportsPage tasks={tasks} complaints={complaints} reviews={reviews} versions={versions}
              reports={reports} onCreateReport={createReport} onRegenerate={runGeneration} onDeleteReport={deleteReport} onUpdateNote={updateReportNote} />
          ) : view === "members" ? (
            <MembersPage accounts={accounts} onSetRole={setMemberRole} onAddMember={addMember} onDeleteMember={deleteMember} />
          ) : (
            <RulesPage commonCats={commonCats} setCommonCats={setCommonCats} privateCats={privateCats} setPrivateCats={setPrivateCats} principles={principles} setPrinciples={setPrinciples} knowledge={knowledge} onAddKnowledge={addKnowledge} onUpdateKnowledge={updateKnowledge} onDeleteKnowledge={deleteKnowledge} agentTypes={agentTypes} onAddAgentType={addAgentType} onRenameAgentType={renameAgentType} onDeleteAgentType={deleteAgentType} agentTypeRefCount={agentTypeRefCount} targetRuleName={targetRuleName} targetEditable={targetEditable} onTargetConsumed={() => { setTargetRuleName(null); setTargetEditable(false); }} onRulesModified={() => {}} showBack={backToQuality} onBack={backToQuality ? () => { setView("quality"); setBackToQuality(false); } : undefined} readOnly={!canEditRules(currentUser.role)}
              canConfigureTools={currentUser.role === "admin"}
              versions={versions} latestVersion={latestVersion} totalSeq={totalSeq} isDirty={isDirty} viewingVersionId={viewingVersionId} setViewingVersionId={setViewingVersionId} onSaveVersion={saveVersion} onDiscardChanges={discardChanges} onRestoreVersion={restoreVersion}/>
          )}
        </div>
      </section>
    </main>
  );
}