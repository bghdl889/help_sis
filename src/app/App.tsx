import React, { useState } from "react";
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
} from "lucide-react";

type Role = "agent" | "inspector";
type Account = { name: string; password: string; role: Role };
type View = "quality" | "rules" | "records";
type ChatMsg = { from: "user" | "agent"; text: string; time: string };
type AiIssue = { rule: string; score: string; quote: string };
type Complaint = {
  id: string;
  agent: string;
  user: string;
  score: number;
  chat: ChatMsg[];
  aiIssues: AiIssue[];
};
type Review = {
  agreed: boolean;
  objections: { rule: string; reason: string }[];
  suggestedScore: string;
  detail: string;
};

const COMPLAINTS: Complaint[] = [
  {
    id: "c1",
    agent: "李梦",
    user: "用户01363539162",
    score: 88,
    chat: [
      { from: "user", text: "这个活动的门槛到底是充值满多少？页面写得太绕了。", time: "10:02" },
      { from: "agent", text: "您好，活动规则页面都写着呢，您再仔细看看。", time: "10:03" },
      { from: "user", text: "我看了才来问的，就是没看明白……", time: "10:04" },
      { from: "agent", text: "您已经问过了，规则页面都写着呢。", time: "10:05" },
      { from: "user", text: "行吧。", time: "10:06" },
    ],
    aiIssues: [
      { rule: "缺乏耐心", score: "-2", quote: "「您已经问过了，规则页面都写着呢。」" },
    ],
  },
  {
    id: "c2",
    agent: "王浩",
    user: "V2055A",
    score: 72,
    chat: [
      { from: "user", text: "我参加的返利活动怎么没到账？", time: "14:20" },
      { from: "agent", text: "这个我之前说过了，您再看看活动页面吧。", time: "14:21" },
      { from: "user", text: "我等了两天了，很着急，能不能帮我查一下！", time: "14:22" },
      { from: "agent", text: "好的好的，您稍等。", time: "14:23" },
      { from: "user", text: "……你们到底管不管？", time: "14:30" },
    ],
    aiIssues: [
      { rule: "缺乏耐心", score: "-2", quote: "「这个我之前说过了，您再看看活动页面吧。」" },
      { rule: "安抚不到位", score: "-2", quote: "「好的好的，您稍等。」（玩家明显不满，未作安抚）" },
    ],
  },
  {
    id: "c3",
    agent: "李梦",
    user: "大有可为双鱼座",
    score: 95,
    chat: [
      { from: "user", text: "请问新手礼包在哪里领？", time: "09:10" },
      { from: "agent", text: "您好，进入游戏后点击右上角「福利」→「新手礼包」即可一键领取，已为您截图标注。", time: "09:11" },
      { from: "user", text: "找到了，谢谢！", time: "09:12" },
    ],
    aiIssues: [],
  },
  {
    id: "c4",
    agent: "陈静",
    user: "机械鲨富大傻俏",
    score: 61,
    chat: [
      { from: "user", text: "我充值了但是钻石没到账，钱也扣了！", time: "20:41" },
      { from: "agent", text: "这是系统问题，我这边无法处理。", time: "20:42" },
      { from: "user", text: "那我找谁？钱不能白扣啊。", time: "20:43" },
    ],
    aiIssues: [
      { rule: "安抚不到位", score: "-2", quote: "「这是系统问题，我这边无法处理。」（随即结束对话）" },
    ],
  },
];

function PluginSidebar({
  view,
  setView,
  currentUser,
  onLogout,
}: {
  view: View;
  setView: (view: View) => void;
  currentUser: Account;
  onLogout: () => void;
}) {
  const isInspector = currentUser.role === "inspector";
  const roleLabel = isInspector ? "质检人员" : "客服";
  return (
    <aside className="flex w-[184px] shrink-0 flex-col bg-[#293542] px-3 py-4 text-[#c5ced8]">
      <div className="mb-7 flex items-center gap-2 px-2">
        <div className="grid size-8 place-items-center rounded-lg bg-[#4d82f6] text-[16px] font-bold text-white">
          Q
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
      {isInspector ? (
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
            className={`flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "rules" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
          >
            <SlidersHorizontal className="size-4" />
            规则设置
          </button>
        </>
      ) : (
        <button
          onClick={() => setView("records")}
          className={`flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "records" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
        >
          <UserRound className="size-4" />
          个人记录
        </button>
      )}
      <div className="mt-auto border-t border-[#465361] pt-3">
        <div className="flex items-center gap-2 px-1">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#4d82f6] text-[13px] font-semibold text-white">
            {currentUser.name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-medium text-white">{currentUser.name}</div>
            <div className="text-[10px] text-[#9eabb9]">{roleLabel}</div>
          </div>
          <button onClick={onLogout} title="退出登录" className="grid size-7 shrink-0 place-items-center rounded-md text-[#9eabb9] hover:bg-[#354454] hover:text-white">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function QualityHome({ commonCats, privateCats, openTaskName, setOpenTaskName, openComplaintId, setOpenComplaintId, reviews, setReviews, onGoToRule }: { commonCats: Cat[]; privateCats: Cat[]; openTaskName: string | null; setOpenTaskName: (name: string | null) => void; openComplaintId: string | null; setOpenComplaintId: (id: string | null) => void; reviews: Record<string, Review>; setReviews: React.Dispatch<React.SetStateAction<Record<string, Review>>>; onGoToRule: (name: string) => void }) {
  type TaskRow = { name: string; status: string; note: string; date: string };
  const [tasks, setTasks] = useState<TaskRow[]>([
    { name: "2024-10-11 客诉服务质检", status: "已完成", note: "十月第二周", date: "2024-10-11" },
    { name: "2024-10-10 客诉服务质检", status: "异常", note: "AI 检查中断", date: "2024-10-10" },
    { name: "2024-10-09 客诉服务质检", status: "已完成", note: "十月第二周", date: "2024-10-09" },
  ]);
  const detailTask = openTaskName ? tasks.find(t => t.name === openTaskName) ?? null : null;
  const setDetailTask = (task: TaskRow | null) => setOpenTaskName(task ? task.name : null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editingCell, setEditingCell] = useState<{ name: string; field: "name" | "note" } | null>(null);
  const [editingValue, setEditingValue] = useState("");

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

  const openComplaint = openComplaintId ? COMPLAINTS.find(c => c.id === openComplaintId) ?? null : null;
  if (detailTask && openComplaint) {
    return (
      <ConversationReview
        complaint={openComplaint}
        review={reviews[openComplaint.id] ?? null}
        onBack={() => setOpenComplaintId(null)}
        onSave={(r) => setReviews(prev => ({ ...prev, [openComplaint.id]: r }))}
        onGoToRule={onGoToRule}
      />
    );
  }

  if (detailTask) {
    const finalScore = (c: Complaint) => {
      const r = reviews[c.id];
      if (r && !r.agreed && r.suggestedScore.trim() !== "" && !Number.isNaN(Number(r.suggestedScore))) {
        return Number(r.suggestedScore);
      }
      return c.score;
    };
    const allReviewed = COMPLAINTS.every(c => reviews[c.id]);
    const summary = Array.from(new Set(COMPLAINTS.map(c => c.agent))).map(agent => {
      const rows = COMPLAINTS.filter(c => c.agent === agent).map(finalScore);
      const avg = Math.round((rows.reduce((a, b) => a + b, 0) / rows.length) * 10) / 10;
      return { agent, count: rows.length, avg, min: Math.min(...rows) };
    });
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
        <header className="flex h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setDetailTask(null)} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
              <ChevronRight className="size-3 rotate-180" />返回
            </button>
            <div>
              <h1 className="text-[15px] font-semibold text-[#2f3b48]">{detailTask.name}</h1>
              <p className="mt-0.5 text-[10px] text-[#8b96a3]">
                {detailTask.status === "已完成" ? "AI 自动质检已完成，请逐条复审客诉；全部复审后展示客服得分汇总。" : "本次 AI 自动质检异常，请在列表中重启任务。"}
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
          <div className="overflow-hidden rounded-lg border border-[#dce6f4] bg-white">
            {detailTask.status === "已完成" ? (
              <div>
                {/* 客服得分汇总 */}
                <div className="border-b border-[#e9edf0] px-4 pb-3 pt-3">
                  <div className="mb-2 text-[11px] font-semibold text-[#374350]">客服得分汇总</div>
                  {allReviewed ? (
                    <>
                      <div className="grid grid-cols-[1fr_1fr_1fr_1fr] bg-[#f5f8fc] px-3 py-1.5 text-[10px] text-[#8b97a3]">
                        <span>客服</span><span>客诉数</span><span>平均分</span><span>最低分</span>
                      </div>
                      {summary.map(row => (
                        <div key={row.agent} className="grid grid-cols-[1fr_1fr_1fr_1fr] items-center border-t border-[#eef1f4] px-3 py-2.5 text-[11px]">
                          <span className="font-medium text-[#3e4c5a]">{row.agent}</span>
                          <span className="text-[#6b7a89]">{row.count} 条</span>
                          <span className={`font-semibold ${row.avg >= 90 ? "text-[#27955d]" : row.avg >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]"}`}>{row.avg}</span>
                          <span className={row.min >= 75 ? "text-[#6b7a89]" : "text-[#d75d5d]"}>{row.min}</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="rounded-md bg-[#f7f9fb] px-3 py-3 text-[10px] leading-relaxed text-[#8b96a3]">
                      需完成全部 {COMPLAINTS.length} 条客诉复审后，才会按最终确认得分计算并展示客服得分汇总。当前已复审 {COMPLAINTS.filter(c => reviews[c.id]).length}/{COMPLAINTS.length} 条。
                    </div>
                  )}
                </div>

                {/* 客诉评分细节 */}
                <div className="px-4 pb-4 pt-3">
                  <div className="mb-2 text-[11px] font-semibold text-[#374350]">客诉评分细节</div>
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: "560px" }}>
                      <div className="grid grid-cols-[70px_120px_64px_88px_72px] bg-[#f5f8fc] px-3 py-1.5 text-[10px] text-[#8b97a3]">
                        <span>客服</span><span>用户名</span><span>评分结果</span><span>复审会话</span><span>审核状态</span>
                      </div>
                      <div className="max-h-[420px] overflow-y-auto">
                        {COMPLAINTS.map((row) => {
                          const reviewed = !!reviews[row.id];
                          const shown = finalScore(row);
                          const changed = shown !== row.score;
                          return (
                            <div key={row.id} className="grid grid-cols-[70px_120px_64px_88px_72px] items-center border-t border-[#eef1f4] px-3 py-2.5 text-[10px]">
                              <span className="font-medium text-[#465260]">{row.agent}</span>
                              <span className="truncate text-[#6b7a89]" title={row.user}>{row.user}</span>
                              <span className="flex items-baseline gap-1">
                                <span className={`font-semibold ${shown >= 90 ? "text-[#27955d]" : shown >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]"}`}>{shown}分</span>
                                {changed && <span className="text-[9px] text-[#98a3af] line-through">{row.score}</span>}
                              </span>
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
                        })}
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
        </div>
      </header>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-[#e1e6eb] bg-white">
              <div className="border-b border-[#e9edf0] px-4 py-3">
                <div className="text-[12px] font-semibold text-[#374350]">自动质检任务列表</div>
                <div className="mt-0.5 text-[10px] text-[#8b97a3]">每日 AI 自动质检生成；已完成可复核结果，异常可重启任务</div>
              </div>
              {filteredTasks.length === 0 ? (
                <div className="px-4 py-8 text-center text-[11px] text-[#b0bbc8]">{(dateFrom || dateTo) ? "所选时间区间内暂无质检任务" : "暂无质检任务"}</div>
              ) : (
                <div className="overflow-x-auto">
                  <div style={{ minWidth: "500px" }}>
                    <div className="grid grid-cols-[1.8fr_.7fr_1fr_.8fr_auto] bg-[#fafbfc] px-4 py-2 text-[10px] text-[#8b97a3]">
                      <span>任务名称</span><span>状态</span><span>备注</span><span>日期</span><span>操作</span>
                    </div>
                    <div className="max-h-[228px] overflow-y-auto">
                      {filteredTasks.map(task => {
                        const isActive = detailTask?.name === task.name;
                        const editingName = editingCell?.name === task.name && editingCell.field === "name";
                        const editingNote = editingCell?.name === task.name && editingCell.field === "note";
                        return (
                          <div key={task.name} className="grid grid-cols-[1.8fr_.7fr_1fr_.8fr_auto] items-center border-t border-[#edf0f3] px-4 py-2.5 text-left text-[11px] transition hover:bg-[#f8fbff]">
                            {editingName ? (
                              <input autoFocus value={editingValue} onChange={e => setEditingValue(e.target.value)}
                                onBlur={() => commitEdit(task)} onKeyDown={e => { if (e.key === "Enter") commitEdit(task); if (e.key === "Escape") setEditingCell(null); }}
                                className="h-6 w-full rounded border border-[#4b7ff0] bg-white px-2 text-[11px] font-medium outline-none" />
                            ) : (
                              <span className="cursor-text font-medium text-[#465260] hover:text-[#4b7ff0]" onClick={() => startEdit(task, "name")} title="点击编辑">{task.name}</span>
                            )}
                            <span>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${task.status === "已完成" ? "bg-[#e6f4ee] text-[#27955d]" : "bg-[#fdeceb] text-[#d75d5d]"}`}>
                                <span className={`size-1.5 rounded-full ${task.status === "已完成" ? "bg-[#34a36a]" : "bg-[#d75d5d]"}`} />
                                {task.status}
                              </span>
                            </span>
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
                            <div className="flex items-center justify-start gap-1.5">
                              {task.status === "已完成" ? (
                                <button onClick={() => setDetailTask(task)}
                                  className="rounded border border-[#d9e2ee] bg-white px-2 py-1 text-[10px] text-[#4b7ff0] transition hover:bg-[#eef5ff]">
                                  复核结果
                                </button>
                              ) : (
                                <button onClick={() => { setTasks(prev => prev.map(t => t.name === task.name ? { ...t, status: "已完成" } : t)); }} className="rounded border border-[#d9e2ee] bg-white px-2 py-1 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
                                  重启任务
                                </button>
                              )}
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

function ConversationReview({ complaint, review, onBack, onSave, onGoToRule }: { complaint: Complaint; review: Review | null; onBack: () => void; onSave: (r: Review) => void; onGoToRule: (name: string) => void }) {
  const involvedRules = Array.from(new Set(complaint.aiIssues.map(i => i.rule)));
  const [editing, setEditing] = useState(false);
  const [selectedRules, setSelectedRules] = useState<string[]>(review && !review.agreed ? review.objections.map(o => o.rule) : []);
  const [ruleReasons, setRuleReasons] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    if (review && !review.agreed) review.objections.forEach(o => { m[o.rule] = o.reason; });
    return m;
  });
  const [score, setScore] = useState(review?.suggestedScore ?? "");
  const [detail, setDetail] = useState(review?.detail ?? "");
  const [err, setErr] = useState("");

  function toggleRule(r: string) {
    setSelectedRules(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
    if (err) setErr("");
  }
  function agreeNoIssue() {
    onSave({ agreed: true, objections: [], suggestedScore: "", detail: "" });
    setEditing(false);
  }
  function startObjection() {
    setEditing(true);
    setErr("");
    if (review && !review.agreed) {
      setSelectedRules(review.objections.map(o => o.rule));
      const m: Record<string, string> = {};
      review.objections.forEach(o => { m[o.rule] = o.reason; });
      setRuleReasons(m);
      setScore(review.suggestedScore);
      setDetail(review.detail);
    } else {
      setSelectedRules([]); setRuleReasons({}); setScore(""); setDetail("");
    }
  }
  function saveObjection() {
    if (selectedRules.length === 0) { setErr("请至少选择一个有异议的评分规则"); return; }
    if (selectedRules.some(r => !(ruleReasons[r] ?? "").trim())) { setErr("请分别说明每个所选规则扣分不合理的原因"); return; }
    if (!score.trim()) { setErr("请填写该客服应有的总分"); return; }
    if (!detail.trim()) { setErr("请填写意见细节"); return; }
    onSave({
      agreed: false,
      objections: selectedRules.map(r => ({ rule: r, reason: ruleReasons[r].trim() })),
      suggestedScore: score.trim(),
      detail: detail.trim(),
    });
    setEditing(false);
    setErr("");
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex h-[58px] items-center gap-3 border-b border-[#e2e6eb] bg-white px-5">
        <button onClick={onBack} className="flex items-center gap-1 rounded-md border border-[#d9e2ee] bg-white px-2.5 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
          <ChevronRight className="size-3 rotate-180" />返回
        </button>
        <div>
          <h1 className="text-[15px] font-semibold text-[#2f3b48]">复审会话 · {complaint.agent}</h1>
          <p className="mt-0.5 text-[10px] text-[#8b96a3]">用户 {complaint.user} · AI 评分 {complaint.score} 分</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-[560px] space-y-4">
          {/* 对话气泡 */}
          <div className="rounded-lg border border-[#dce6f4] bg-white p-4">
            <div className="mb-3 text-[11px] font-semibold text-[#374350]">客服与用户对话</div>
            <div className="space-y-2.5">
              {complaint.chat.map((m, i) => (
                <div key={i} className={`flex ${m.from === "agent" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] ${m.from === "agent" ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                    <span className="px-1 text-[9px] text-[#a8b2be]">{m.from === "agent" ? "客服" : "用户"} · {m.time}</span>
                    <div className={`rounded-2xl px-3 py-2 text-[11px] leading-relaxed ${m.from === "agent" ? "rounded-br-sm bg-[#4b7ff0] text-white" : "rounded-bl-sm bg-[#eef1f5] text-[#3e4c5a]"}`}>
                      {m.text}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI 评分明细 */}
          <div className="rounded-lg border border-[#dce6f4] bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-semibold text-[#374350]">AI 评分明细</div>
              <span className={`text-[12px] font-semibold ${complaint.score >= 90 ? "text-[#27955d]" : complaint.score >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]"}`}>{complaint.score} 分</span>
            </div>
            {complaint.aiIssues.length === 0 ? (
              <div className="rounded-md bg-[#f2faf5] px-3 py-2 text-[10px] text-[#27955d]">本次会话无扣分项，AI 判定表现良好。</div>
            ) : (
              <div className="space-y-2">
                {complaint.aiIssues.map((iss, i) => (
                  <div key={i} className="rounded-md border border-[#f2e2e2] bg-[#fdf6f6] px-3 py-2">
                    <div className="mb-1 flex items-center gap-2">
                      <button onClick={() => onGoToRule(iss.rule)} className="rounded bg-[#fff0f0] px-1.5 py-0.5 text-[10px] text-[#d75d5d] hover:bg-[#ffd9d9] hover:underline">{iss.rule}</button>
                      <span className="text-[10px] font-medium text-[#d75d5d]">{iss.score}</span>
                    </div>
                    <div className="text-[10px] italic text-[#8797a5]">{iss.quote}</div>
                  </div>
                ))}
              </div>
            )}

            {/* 复审结论 / 决策按钮 */}
            {!editing && (
              <div className="mt-3 flex items-center justify-end gap-2 border-t border-[#eef1f4] pt-3">
                {review ? (
                  review.agreed ? (
                    <>
                      <span className="mr-auto flex items-center gap-1 text-[10px] text-[#27955d]"><span className="size-1.5 rounded-full bg-[#34a36a]" />已确认 AI 评分无异议</span>
                      <button onClick={startObjection} className="rounded-md border border-[#d9e2ee] bg-white px-3 py-1.5 text-[10px] text-[#6b7a89] hover:bg-[#f2f5f9]">改为有异议</button>
                    </>
                  ) : (
                    <>
                      <span className="mr-auto flex items-center gap-1 text-[10px] text-[#e59735]"><span className="size-1.5 rounded-full bg-[#e59735]" />已提交异议意见</span>
                      <button onClick={startObjection} className="rounded-md border border-[#d9e2ee] bg-white px-3 py-1.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">修改意见</button>
                    </>
                  )
                ) : (
                  <>
                    <span className="mr-auto text-[10px] text-[#8b96a3]">对以上 AI 评分是否认可？</span>
                    <button onClick={agreeNoIssue} className="rounded-md bg-[#27955d] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#22824f]">没问题</button>
                    <button onClick={startObjection} className="rounded-md border border-[#e2b3b3] bg-white px-3 py-1.5 text-[10px] font-medium text-[#d75d5d] hover:bg-[#fdf1f1]">有异议</button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 已保存的异议详情（只读） */}
          {!editing && review && !review.agreed && (
            <div className="rounded-lg border border-[#dce6f4] bg-white p-4">
              <div className="mb-2 text-[11px] font-semibold text-[#374350]">修改意见</div>
              <div className="space-y-2">
                {review.objections.map(o => (
                  <div key={o.rule} className="rounded-md bg-[#f7f9fb] px-3 py-2">
                    <button onClick={() => onGoToRule(o.rule)} className="mb-1 rounded bg-[#eef4ff] px-1.5 py-0.5 text-[10px] text-[#4b7ff0] hover:bg-[#dbe8ff] hover:underline">{o.rule}</button>
                    <div className="text-[11px] leading-relaxed text-[#4d5966]">{o.reason}</div>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-[#8b97a3]">建议总分</span>
                  <span className="text-[12px] font-semibold text-[#4b7ff0]">{review.suggestedScore} 分</span>
                </div>
                <div>
                  <div className="mb-1 text-[10px] text-[#8b97a3]">意见细节</div>
                  <div className="rounded-md bg-[#f7f9fb] px-3 py-2 text-[11px] leading-relaxed text-[#4d5966]">{review.detail}</div>
                </div>
              </div>
            </div>
          )}

          {/* 异议编辑表单 */}
          {editing && (
            <div className="rounded-lg border border-[#dce6f4] bg-white p-4">
              <div className="mb-2 text-[11px] font-semibold text-[#374350]">对 AI 评分的修改意见</div>
              {involvedRules.length === 0 ? (
                <p className="text-[10px] text-[#8b96a3]">本次会话 AI 未涉及任何扣分规则，无可提出异议的评分项。</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[10px] text-[#8b97a3]">选择有异议的评分规则（可多选）</label>
                    <div className="flex flex-wrap gap-1.5">
                      {involvedRules.map(r => {
                        const on = selectedRules.includes(r);
                        return (
                          <button key={r} onClick={() => toggleRule(r)} className={`rounded-full px-2.5 py-1 text-[10px] transition ${on ? "bg-[#4b7ff0] font-medium text-white" : "bg-[#eef1f5] text-[#6b7a89] hover:bg-[#e2e8f0]"}`}>{on ? "✓ " : ""}{r}</button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedRules.map(r => (
                    <div key={r}>
                      <div className="mb-1 flex items-center gap-2">
                        <label className="text-[10px] text-[#8b97a3]">「{r}」扣分不合理的原因</label>
                        <button onClick={() => onGoToRule(r)} className="text-[10px] text-[#4b7ff0] hover:underline">查看规则明细 →</button>
                      </div>
                      <textarea
                        value={ruleReasons[r] ?? ""}
                        onChange={e => { setRuleReasons(prev => ({ ...prev, [r]: e.target.value })); if (err) setErr(""); }}
                        rows={2}
                        placeholder={`说明「${r}」这一项 AI 扣分为何不合理…`}
                        className="w-full resize-none rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-[11px] leading-relaxed text-[#3e4c5a] outline-none focus:border-[#4b7ff0]"
                      />
                    </div>
                  ))}

                  <div>
                    <label className="mb-1 block text-[10px] text-[#8b97a3]">该客服应有的总分</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number" min={0} max={100}
                        value={score}
                        onChange={e => { setScore(e.target.value); if (err) setErr(""); }}
                        placeholder="0 - 100"
                        className="h-8 w-24 rounded-md border border-[#dbe3ee] bg-white px-2 text-[11px] text-[#3e4c5a] outline-none focus:border-[#4b7ff0]"
                      />
                      <span className="text-[10px] text-[#8b97a3]">分</span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] text-[#8b97a3]">意见细节</label>
                    <textarea
                      value={detail}
                      onChange={e => { setDetail(e.target.value); if (err) setErr(""); }}
                      rows={3}
                      placeholder="补充说明本次复审的整体意见…"
                      className="w-full resize-none rounded-md border border-[#dbe3ee] bg-white px-3 py-2 text-[11px] leading-relaxed text-[#3e4c5a] outline-none focus:border-[#4b7ff0]"
                    />
                  </div>

                  {err && <div className="text-[10px] text-[#d75d5d]">{err}</div>}

                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setEditing(false); setErr(""); }} className="rounded-md border border-[#d9e2ee] bg-white px-3 py-1.5 text-[10px] text-[#6b7a89] hover:bg-[#f2f5f9]">取消</button>
                    <button onClick={saveObjection} className="rounded-md bg-[#4b7ff0] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#3d6fe0]">提交修改意见</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({
  on,
  onClick,
}: {
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative h-4 w-7 rounded-full transition ${on ? "bg-[#4b7ff0]" : "bg-[#c8d0d8]"}`}
    >
      <span
        className={`absolute top-0.5 size-3 rounded-full bg-white transition ${on ? "right-0.5" : "left-0.5"}`}
      />
    </button>
  );
}

type Dim = { title: string; score: string; standard: string; criteria: string };
type Cat = { name: string; expanded: boolean; enabled: boolean; renaming: boolean; dimensions: Dim[] };
type NewDimDraft = { title: string; score: string; standard: string; criteria: string };

function RulesList({
  label,
  sublabel,
  cats,
  setCats,
  targetRuleName,
  onTargetConsumed,
}: {
  label: string;
  sublabel: string;
  cats: Cat[];
  setCats: React.Dispatch<React.SetStateAction<Cat[]>>;
  targetRuleName?: string | null;
  onTargetConsumed?: () => void;
}) {
  const [menuOpenIdx, setMenuOpenIdx] = useState<number | null>(null);
  const [catNameDraft, setCatNameDraft] = useState("");
  const [editingKey, setEditingKey] = useState<{ cat: number; dim: number } | null>(null);
  const [viewingKey, setViewingKey] = useState<{ cat: number; dim: number } | null>(null);
  const [dimDrafts, setDimDrafts] = useState<Record<string, Dim>>({});
  const [addingDim, setAddingDim] = useState<number | null>(null);
  const emptyDraft: NewDimDraft = { title: "", score: "", standard: "", criteria: "" };
  const [newDimDraft, setNewDimDraft] = useState<NewDimDraft>(emptyDraft);
  const dimRowRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  React.useEffect(() => {
    if (!targetRuleName) return;
    for (let ci = 0; ci < cats.length; ci++) {
      for (let di = 0; di < cats[ci].dimensions.length; di++) {
        if (cats[ci].dimensions[di].title === targetRuleName) {
          const key = `${ci}-${di}`;
          setCats(prev => prev.map((c, i) => i === ci ? { ...c, expanded: true } : c));
          setEditingKey(null);
          setViewingKey({ cat: ci, dim: di });
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
  }
  function addCat() {
    setCats(prev => [...prev, { name: "", expanded: false, enabled: true, renaming: true, dimensions: [] }]);
    setCatNameDraft("");
  }
  function saveDim(catIdx: number, dimIdx: number, draft: Dim) {
    setCats(prev => prev.map((c, ci) => ci !== catIdx ? c : {
      ...c,
      dimensions: c.dimensions.map((d, di) => di !== dimIdx ? d : { ...d, ...draft }),
    }));
    setEditingKey(null);
  }
  function saveNewDim(catIdx: number) {
    if (!newDimDraft.title.trim()) return;
    setCats(prev => prev.map((c, ci) => ci !== catIdx ? c : {
      ...c,
      dimensions: [...c.dimensions, { ...newDimDraft }],
    }));
    setAddingDim(null);
    setNewDimDraft(emptyDraft);
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
          className="flex h-7 items-center gap-1 rounded border border-[#d5e0f5] bg-[#eaf2ff] px-2.5 text-[11px] text-[#4b7ff0] hover:bg-[#daeaff]"
        >
          <Plus className="size-3.5"/>添加
        </button>
      </div>

      {/* 空状态 */}
      {cats.length === 0 && (
        <div className="px-4 py-8 text-center text-[11px] text-[#b0bbc8]">暂无规则门类，点击右上角「添加」新建</div>
      )}

      {/* 一级门类列表 */}
      {cats.map((cat, catIdx) => (
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
            <Toggle on={cat.enabled} onClick={() => updateCat(catIdx, { enabled: !cat.enabled })}/>
            <div className="relative" onClick={e => e.stopPropagation()}>
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
              {/* 现有二级维度 */}
              {cat.dimensions.map((dim, dimIdx) => {
                const key = `${catIdx}-${dimIdx}`;
                const draft = dimDrafts[key];
                const isEditing = editingKey?.cat === catIdx && editingKey?.dim === dimIdx;
                const isViewing = viewingKey?.cat === catIdx && viewingKey?.dim === dimIdx;
                return (
                  <div key={dimIdx} ref={el => { dimRowRefs.current[`${catIdx}-${dimIdx}`] = el; }} className={`border-b border-[#f2f4f7] px-5 transition ${isViewing ? "bg-[#eef5ff] ring-1 ring-inset ring-[#4b7ff0]" : ""}`}>
                    {/* 维度行 */}
                    <div className="grid grid-cols-[1.6fr_2.4fr_.5fr_.55fr] items-center gap-3 py-2.5 text-[11px]">
                      <div className="font-medium text-[#465260]">{dim.title}</div>
                      <div className="truncate text-[10px] text-[#8797a5]">{dim.standard || "—"}</div>
                      <span className="rounded bg-[#fff0f0] px-1.5 py-0.5 text-center text-[10px] text-[#d75d5d]">{dim.score} 分</span>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            if (isEditing) { setEditingKey(null); } else {
                              setDimDrafts(prev => ({ ...prev, [key]: { title: dim.title, score: dim.score, standard: dim.standard, criteria: dim.criteria } }));
                              setEditingKey({ cat: catIdx, dim: dimIdx });
                              setViewingKey(null);
                              setAddingDim(null);
                            }
                          }}
                          className={`text-[10px] ${isEditing ? "text-[#4b7ff0]" : "text-[#778695] hover:text-[#4b7ff0]"}`}
                        >{isEditing ? "收起" : "修改"}</button>
                        <button onClick={() => deleteDim(catIdx, dimIdx)} className="text-[10px] text-[#b0bbc8] hover:text-[#d75d5d]">删除</button>
                      </div>
                    </div>
                    {/* 只读明细（从复审跳转进入） */}
                    {isViewing && !isEditing && (
                      <div className="mb-3 rounded-md border border-[#dfe7f4] bg-[#f8fbff] p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] font-medium text-[#496078]">规则明细（只读）</span>
                          <button onClick={() => setViewingKey(null)} className="text-[10px] text-[#8b97a3] hover:text-[#4b7ff0]">收起</button>
                        </div>
                        <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-[10px]">
                          <span className="text-[#8794a0]">维度名称</span>
                          <span className="text-[#465260]">{dim.title}</span>
                          <span className="text-[#8794a0]">分值</span>
                          <span className="text-[#d75d5d]">{dim.score} 分</span>
                          <span className="text-[#8794a0]">说明</span>
                          <span className="leading-relaxed text-[#4d5966]">{dim.standard || "—"}</span>
                          <span className="text-[#8794a0]">判断标准</span>
                          <span className="leading-relaxed text-[#4d5966]">{dim.criteria || "—"}</span>
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
                          <span className="pt-1 text-[#8794a0]">分值</span>
                          <input value={draft.score} onChange={e => setDimDrafts(p => ({ ...p, [key]: { ...p[key], score: e.target.value } }))} className="h-6 w-16 rounded border border-[#dbe3ee] bg-white px-2 text-[10px] outline-none focus:border-[#4b7ff0]"/>
                          <span className="pt-1 text-[#8794a0]">说明</span>
                          <textarea value={draft.standard} onChange={e => setDimDrafts(p => ({ ...p, [key]: { ...p[key], standard: e.target.value } }))} rows={2} className="resize-none rounded border border-[#dbe3ee] bg-white px-2 py-1 text-[10px] leading-4 outline-none focus:border-[#4b7ff0]"/>
                          <span className="pt-1 text-[#8794a0]">判断标准</span>
                          <textarea value={draft.criteria} onChange={e => setDimDrafts(p => ({ ...p, [key]: { ...p[key], criteria: e.target.value } }))} rows={2} className="resize-none rounded border border-[#dbe3ee] bg-white px-2 py-1 text-[10px] leading-4 outline-none focus:border-[#4b7ff0]"/>
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
                    <span className="pt-1 text-[#8794a0]">分值</span>
                    <input value={newDimDraft.score} onChange={e => setNewDimDraft(p => ({ ...p, score: e.target.value }))} placeholder="-2" className="h-6 w-16 rounded border border-[#dbe3ee] bg-white px-2 text-[10px] outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
                    <span className="pt-1 text-[#8794a0]">说明</span>
                    <textarea value={newDimDraft.standard} onChange={e => setNewDimDraft(p => ({ ...p, standard: e.target.value }))} rows={2} placeholder="简述该维度的质检说明…" className="resize-none rounded border border-[#dbe3ee] bg-white px-2 py-1 text-[10px] leading-4 outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
                    <span className="pt-1 text-[#8794a0]">判断标准</span>
                    <textarea value={newDimDraft.criteria} onChange={e => setNewDimDraft(p => ({ ...p, criteria: e.target.value }))} rows={2} placeholder="描述如何判断扣分…" className="resize-none rounded border border-[#dbe3ee] bg-white px-2 py-1 text-[10px] leading-4 outline-none focus:border-[#4b7ff0] placeholder-[#b5bfc9]"/>
                  </div>
                </div>
              ) : (
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
      ))}
    </div>
  );
}

function RulesPage({ commonCats, setCommonCats, privateCats, setPrivateCats, targetRuleName, onTargetConsumed, showBack, onBack }: {
  commonCats: Cat[]; setCommonCats: React.Dispatch<React.SetStateAction<Cat[]>>;
  privateCats: Cat[]; setPrivateCats: React.Dispatch<React.SetStateAction<Cat[]>>;
  targetRuleName: string | null; onTargetConsumed: () => void;
  showBack?: boolean;
  onBack?: () => void;
}) {
  const inCommon = targetRuleName ? commonCats.some(c => c.dimensions.some(d => d.title === targetRuleName)) : false;
  const inPrivate = targetRuleName ? privateCats.some(c => c.dimensions.some(d => d.title === targetRuleName)) : false;
  const [tab, setTab] = useState<"common" | "private">("common");

  React.useEffect(() => {
    if (targetRuleName) {
      if (inCommon) setTab("common");
      else if (inPrivate) setTab("private");
    }
  }, [targetRuleName]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5">
        <div>
          <h1 className="text-[15px] font-semibold text-[#2f3b48]">质检规则管理</h1>
          <p className="mt-0.5 text-[10px] text-[#8b96a3]">配置规则门类、评分维度与扣分标准</p>
        </div>
        {showBack && onBack && (
          <button onClick={onBack} className="flex items-center gap-1 rounded-md border border-[#4b7ff0] bg-[#eaf2ff] px-2.5 py-1.5 text-[10px] font-medium text-[#3562c8] hover:bg-[#dceeff]">
            <ChevronRight className="size-3 rotate-180" />返回复核结果
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mb-3 flex w-fit rounded-md border border-[#dfe5ea] bg-white p-0.5">
          <button onClick={() => setTab("common")} className={`rounded px-3 py-1.5 text-[11px] transition ${tab === "common" ? "bg-[#eaf2ff] font-medium text-[#3e72df]" : "text-[#778594]"}`}>通用质检规则列表</button>
          <button onClick={() => setTab("private")} className={`rounded px-3 py-1.5 text-[11px] transition ${tab === "private" ? "bg-[#eaf2ff] font-medium text-[#3e72df]" : "text-[#778594]"}`}>专用质检规则列表</button>
        </div>
        {tab === "common" ? (
          <RulesList label="通用规则" sublabel="适用于全部客服会话的基础质检要求" cats={commonCats} setCats={setCommonCats} targetRuleName={tab === "common" ? targetRuleName : null} onTargetConsumed={onTargetConsumed}/>
        ) : (
          <RulesList label="专用规则" sublabel="仅对指定业务线、活动或场景生效" cats={privateCats} setCats={setPrivateCats} targetRuleName={tab === "private" ? targetRuleName : null} onTargetConsumed={onTargetConsumed}/>
        )}
      </div>
    </div>
  );
}

function AgentRecords({ currentUser }: { currentUser: Account }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5">
        <div>
          <h1 className="text-[15px] font-semibold text-[#2f3b48]">个人记录</h1>
          <p className="mt-0.5 text-[10px] text-[#8b96a3]">{currentUser.name}的质检得分与被质检明细</p>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 place-items-center p-5">
        <div className="max-w-[280px] text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-[#fdf3e6] text-[#e59735]">
            <UserRound className="size-6" />
          </div>
          <div className="text-[13px] font-semibold text-[#e59735]">该功能暂不开放中</div>
          <div className="mt-1.5 text-[10px] leading-relaxed text-[#8b97a3]">个人记录功能正在建设中，敬请期待。后续将展示您的质检得分与被质检明细。</div>
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

export default function App() {
  const [view, setView] = useState<View>("quality");
  const [closed, setClosed] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentUser, setCurrentUser] = useState<Account | null>(null);
  const [authView, setAuthView] = useState<"login" | "register">("login");
  const [targetRuleName, setTargetRuleName] = useState<string | null>(null);
  const [backToQuality, setBackToQuality] = useState(false);
  const [openTaskName, setOpenTaskName] = useState<string | null>(null);
  const [openComplaintId, setOpenComplaintId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, Review>>({});

  function enter(acc: Account) {
    setCurrentUser(acc);
    setView(acc.role === "inspector" ? "quality" : "records");
  }
  function logout() {
    setCurrentUser(null);
    setTargetRuleName(null);
    setBackToQuality(false);
    setOpenTaskName(null);
    setOpenComplaintId(null);
    setReviews({});
    setAuthView("login");
  }
  const initCommonCats: Cat[] = [
    {
      name: "服务态度",
      expanded: false,
      enabled: true,
      renaming: false,
      dimensions: [
        {
          title: "缺乏耐心",
          score: "-2",
          standard: "面对反复确认、多轮追问时的语气",
          criteria: "不扣：全程平和认真；-2：明显不耐烦、催促结束、推诿、关闭对话过快。不适用：无多轮追问、对话简短平顺",
        },
        {
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
      name: "活动/福利内容存疑",
      expanded: false,
      enabled: true,
      renaming: false,
      dimensions: [
        {
          title: "精准答疑",
          score: "-5",
          standard: "是否直接对应玩家的活动/福利具体疑问，结论清晰、不堆文案、不绕弯",
          criteria: "不扣：直接命中疑问、结论明确，玩家无需追问；-2：答了核心但夹带无关文案/表述绕/需再追问一次；-5：只复述活动规则文案、模板话术敷衍、答非所问或对核心疑问无实质回应（触发核心封顶）。玩家提了活动/福利疑问必评，无不适用。",
        },
      ],
    },
  ];
  const [privateCats, setPrivateCats] = useState(initPrivateCats);
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
    <main className="grid h-dvh min-h-[640px] place-items-center overflow-hidden bg-[radial-gradient(circle_at_20%_10%,#eef5ff,transparent_34%),linear-gradient(135deg,#edf1f4,#e7ecef)] p-7 font-['Noto_Sans_SC'] text-[#4d5966]">
      <section className="flex h-full max-h-[720px] w-full max-w-[1040px] overflow-hidden rounded-xl border border-white/80 bg-white shadow-[0_24px_60px_rgba(41,53,66,.20)]">
        {currentUser && <PluginSidebar view={view} setView={(v) => { setBackToQuality(false); setView(v); }} currentUser={currentUser} onLogout={logout} />}
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
            <AgentRecords currentUser={currentUser} />
          ) : view === "quality" ? (
            <QualityHome commonCats={commonCats} privateCats={privateCats} openTaskName={openTaskName} setOpenTaskName={setOpenTaskName} openComplaintId={openComplaintId} setOpenComplaintId={setOpenComplaintId} reviews={reviews} setReviews={setReviews} onGoToRule={(name) => { setTargetRuleName(name); setBackToQuality(true); setView("rules"); }}/>
          ) : (
            <RulesPage commonCats={commonCats} setCommonCats={setCommonCats} privateCats={privateCats} setPrivateCats={setPrivateCats} targetRuleName={targetRuleName} onTargetConsumed={() => setTargetRuleName(null)} showBack={backToQuality} onBack={backToQuality ? () => { setView("quality"); setBackToQuality(false); } : undefined}/>
          )}
        </div>
      </section>
    </main>
  );
}