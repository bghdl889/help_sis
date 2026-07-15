import React, { useState } from "react";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  LogIn,
  MoreHorizontal,
  Download,
  RefreshCw,
  Check,
  Plus,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";

type View = "quality" | "rules";

const cases = [
  [
    "用户01363539162",
    "吉时活动结束后未返金币",
    "VIP13",
    "活动 / 玩法咨询",
    "等待 2h 13m",
  ],
  [
    "V2055A",
    "贵族礼包领取异常",
    "VIP14",
    "福利 / 添加咨询",
    "等待 1h 46m",
  ],
  [
    "大有可为双鱼座",
    "为什么没有超值返利",
    "VIP17",
    "活动 / 玩法咨询",
    "等待 48m",
  ],
  [
    "机械鲨富大傻俏",
    "BOSS 试练活动充值问题",
    "VIP23",
    "充值 / 订单",
    "等待 20m",
  ],
];

function PluginSidebar({
  view,
  setView,
}: {
  view: View;
  setView: (view: View) => void;
}) {
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
      <button
        onClick={() => setView("quality")}
        className={`mb-1 flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "quality" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
      >
        <ClipboardCheck className="size-4" />
        客服质检
      </button>
      <button
        onClick={() => setView("rules")}
        className={`flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-[12px] transition ${view === "rules" ? "bg-[#4b7ff0] font-medium text-white shadow-sm" : "hover:bg-[#354454]"}`}
      >
        <SlidersHorizontal className="size-4" />
        质检规则管理
      </button>
      <div className="mt-auto border-t border-[#465361] pt-3">
        <button className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[12px] hover:bg-[#354454]">
          <LogIn className="size-4" />
          登录 / 切换账号
        </button>
      </div>
    </aside>
  );
}

function QualityHome({ commonCats, privateCats, onGoToRule }: { commonCats: Cat[]; privateCats: Cat[]; onGoToRule: (name: string) => void }) {
  type TaskRow = { name: string; status: string; note: string; date: string };
  const [tasks, setTasks] = useState<TaskRow[]>([
    { name: "2024-10-10 客诉服务质检", status: "进行中", note: "十月第二周", date: "2024-10-10" },
    { name: "2024-10-03 客诉服务质检", status: "已完成", note: "十月第一周", date: "2024-10-03" },
  ]);
  const [detailTask, setDetailTask] = useState<TaskRow | null>(null);
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
      setDetailTask(prev => prev ? { ...prev, name: editingValue.trim() || prev.name } : prev);
    }
    setEditingCell(null);
  }

  const filteredTasks = tasks.filter(t => {
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
      <header className="flex h-[58px] items-center justify-between border-b border-[#e2e6eb] bg-white px-5">
        <div>
          <h1 className="text-[15px] font-semibold text-[#2f3b48]">客服质检</h1>
          <p className="mt-0.5 text-[10px] text-[#8b96a3]">按时间区间筛选质检任务，复核结果并导出</p>
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
                <div className="text-[12px] font-semibold text-[#374350]">质检任务列表</div>
                <div className="mt-0.5 text-[10px] text-[#8b97a3]">进行中可取消；已完成可复核结果并导出</div>
              </div>
              {filteredTasks.length === 0 ? (
                <div className="px-4 py-8 text-center text-[11px] text-[#b0bbc8]">{(dateFrom || dateTo) ? "所选时间区间内暂无质检任务" : "暂无质检任务"}</div>
              ) : (
                <div className="overflow-x-auto">
                  <div style={{ minWidth: "500px" }}>
                    <div className="grid grid-cols-[1.8fr_.7fr_1fr_.8fr_auto] bg-[#fafbfc] px-4 py-2 text-[10px] text-[#8b97a3]">
                      <span>任务名称</span><span>状态</span><span>备注</span><span>日期</span><span className="text-right">操作</span>
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
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${task.status === "已完成" ? "bg-[#e6f4ee] text-[#27955d]" : "bg-[#fff8ec] text-[#c97d25]"}`}>
                                <span className={`size-1.5 rounded-full ${task.status === "已完成" ? "bg-[#34a36a]" : "bg-[#e59735]"}`} />
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
                            <div className="flex items-center justify-end gap-1.5">
                              {task.status === "已完成" ? (
                                <button onClick={() => setDetailTask(isActive ? null : task)}
                                  className={`rounded border px-2 py-1 text-[10px] transition ${isActive ? "border-[#4b7ff0] bg-[#4b7ff0] text-white" : "border-[#d9e2ee] bg-white text-[#4b7ff0] hover:bg-[#eef5ff]"}`}>
                                  复核结果
                                </button>
                              ) : (
                                <button onClick={() => { setTasks(prev => prev.filter(t => t.name !== task.name)); if (isActive) setDetailTask(null); }} className="rounded border border-[#f0c4c4] bg-white px-2 py-1 text-[10px] text-[#d75d5d] hover:bg-[#fff0f0]">
                                  取消任务
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
            {detailTask && (
              <div className="overflow-hidden rounded-lg border border-[#dce6f4] bg-white">
                {/* 详情面板头部 */}
                <div className="flex items-center justify-between border-b border-[#e9edf0] bg-[#fbfdff] px-4 py-3">
                  <div>
                    <div className="text-[12px] font-semibold text-[#374350]">{detailTask.name}</div>
                    <div className="mt-0.5 text-[10px] text-[#8b97a3]">
                      {detailTask.status === "已完成" ? "任务已完成，以下为各工单质检结果与客服得分汇总。" : "任务质检进行中，完成后将自动生成评分结果。"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {detailTask.status === "已完成" && (
                      <button className="flex items-center gap-1 rounded border border-[#d9e2ee] bg-white px-2 py-1 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
                        <Download className="size-3" />导出 XLSX
                      </button>
                    )}
                    <button onClick={() => setDetailTask(null)} className="rounded border border-[#dde4ec] bg-white px-2 py-1 text-[10px] text-[#718090] hover:bg-[#f5f7f9]">收起</button>
                  </div>
                </div>

                {detailTask.status === "已完成" ? (
                  <div>
                    {/* 客诉明细 */}
                    <div className="border-b border-[#e9edf0] px-4 pb-3 pt-3">
                      <div className="mb-2 text-[11px] font-semibold text-[#374350]">客诉明细</div>
                      <div className="overflow-x-auto">
                        <div style={{ minWidth: "620px" }}>
                          <div className="grid grid-cols-[70px_110px_64px_1fr_72px] bg-[#f5f8fc] px-3 py-1.5 text-[10px] text-[#8b97a3]">
                            <span>客服</span><span>用户名</span><span>评分结果</span><span>扣分明细</span><span>客诉链接</span>
                          </div>
                          <div className="max-h-[384px] overflow-y-auto">
                            {[
                              { agent: "李梦", user: "用户01363539162", issues: [{ rule: "缺乏耐心", quote: "「您已经问过了，规则页面都写着呢。」" }], score: 88, link: "#" },
                              { agent: "王浩", user: "V2055A", issues: [{ rule: "缺乏耐心", quote: "「这个我之前说过了，您再看看活动页面吧。」" }, { rule: "安抚不到位", quote: "「好的好的，您稍等。」（玩家明显不满，未作安抚）" }], score: 72, link: "#" },
                              { agent: "李梦", user: "大有可为双鱼座", issues: [], score: 95, link: "#" },
                              { agent: "陈静", user: "机械鲨富大傻俏", issues: [{ rule: "安抚不到位", quote: "「这是系统问题，我这边无法处理。」（随即结束对话）" }], score: 61, link: "#" },
                            ].map((row, ri) => (
                              <div key={ri} className="grid grid-cols-[70px_110px_64px_1fr_72px] border-t border-[#eef1f4] px-3 py-2.5 text-[10px]">
                                <span className="pt-0.5 font-medium text-[#465260]">{row.agent}</span>
                                <span className="pt-0.5 text-[#6b7a89]">{row.user}</span>
                                <span className={`pt-0.5 font-semibold ${row.score >= 90 ? "text-[#27955d]" : row.score >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]"}`}>{row.score}分</span>
                                <div className="space-y-1.5">
                                  {row.issues.length === 0 ? (
                                    <span className="text-[#27955d]">无扣分项</span>
                                  ) : row.issues.map((issue, ii) => (
                                    <div key={ii} className="space-y-0.5">
                                      <button onClick={() => onGoToRule(issue.rule)} className="rounded bg-[#fff0f0] px-1.5 py-0.5 text-[10px] text-[#d75d5d] hover:bg-[#ffd9d9] hover:underline">{issue.rule}</button>
                                      <div className="text-[10px] italic text-[#8797a5]">{issue.quote}</div>
                                    </div>
                                  ))}
                                </div>
                                <div className="pt-0.5">
                                  <a href={row.link} className="inline-flex items-center gap-0.5 rounded border border-[#dbe3ee] px-1.5 py-0.5 text-[10px] text-[#4b7ff0] hover:bg-[#eef5ff]">
                                    <SlidersHorizontal className="size-2.5" />查看
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 客服得分汇总 */}
                    <div className="px-4 pb-4 pt-3">
                      <div className="mb-2 text-[11px] font-semibold text-[#374350]">客服得分汇总</div>
                      <div className="grid grid-cols-[1fr_1fr_1fr_1fr] bg-[#f5f8fc] px-3 py-1.5 text-[10px] text-[#8b97a3]">
                        <span>客服</span><span>客诉数</span><span>平均分</span><span>最低分</span>
                      </div>
                      {[
                        { agent: "李梦", count: 2, avg: 91.5, min: 88 },
                        { agent: "王浩", count: 1, avg: 72, min: 72 },
                        { agent: "陈静", count: 1, avg: 61, min: 61 },
                      ].map(row => (
                        <div key={row.agent} className="grid grid-cols-[1fr_1fr_1fr_1fr] items-center border-t border-[#eef1f4] px-3 py-2.5 text-[11px]">
                          <span className="font-medium text-[#3e4c5a]">{row.agent}</span>
                          <span className="text-[#6b7a89]">{row.count} 条</span>
                          <span className={`font-semibold ${row.avg >= 90 ? "text-[#27955d]" : row.avg >= 75 ? "text-[#4b7ff0]" : "text-[#d75d5d]"}`}>{row.avg}</span>
                          <span className={row.min >= 75 ? "text-[#6b7a89]" : "text-[#d75d5d]"}>{row.min}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-5">
                    <div className="mb-3 grid grid-cols-2 gap-3">
                      <div className="rounded-md bg-[#f7f9fb] px-3 py-2.5">
                        <div className="text-[10px] text-[#8b97a3]">任务状态</div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-[#e59735]" />
                          <span className="text-[11px] font-medium text-[#c97d25]">质检进行中</span>
                        </div>
                      </div>
                      <div className="rounded-md bg-[#f7f9fb] px-3 py-2.5">
                        <div className="text-[10px] text-[#8b97a3]">创建日期</div>
                        <div className="mt-1 text-[11px] font-medium text-[#465260]">{detailTask.date}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-[#e8edf2] bg-[#fafbfc] px-3 py-2.5 text-[10px] text-[#8b97a3]">
                      <span>质检结果将在全部工单处理完成后生成，届时可在此处复核并导出。</span>
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
  onBack,
}: {
  label: string;
  sublabel: string;
  cats: Cat[];
  setCats: React.Dispatch<React.SetStateAction<Cat[]>>;
  targetRuleName?: string | null;
  onTargetConsumed?: () => void;
  onBack?: () => void;
}) {
  const [menuOpenIdx, setMenuOpenIdx] = useState<number | null>(null);
  const [catNameDraft, setCatNameDraft] = useState("");
  const [editingKey, setEditingKey] = useState<{ cat: number; dim: number } | null>(null);
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
          const dim = cats[ci].dimensions[di];
          setCats(prev => prev.map((c, i) => i === ci ? { ...c, expanded: true } : c));
          setDimDrafts(prev => ({ ...prev, [key]: { title: dim.title, score: dim.score, standard: dim.standard, criteria: dim.criteria } }));
          setEditingKey({ cat: ci, dim: di });
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
                return (
                  <div key={dimIdx} ref={el => { dimRowRefs.current[`${catIdx}-${dimIdx}`] = el; }} className={`border-b border-[#f2f4f7] px-5 transition ${isEditing && targetRuleName === dim.title ? "bg-[#eef5ff] ring-1 ring-inset ring-[#4b7ff0]" : ""}`}>
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
                              setAddingDim(null);
                            }
                          }}
                          className={`text-[10px] ${isEditing ? "text-[#4b7ff0]" : "text-[#778695] hover:text-[#4b7ff0]"}`}
                        >{isEditing ? "收起" : "配置"}</button>
                        <button onClick={() => deleteDim(catIdx, dimIdx)} className="text-[10px] text-[#b0bbc8] hover:text-[#d75d5d]">删除</button>
                      </div>
                    </div>
                    {/* 配置面板 */}
                    {isEditing && draft && (
                      <div className="mb-3 rounded-md border border-[#dfe7f4] bg-[#f8fbff] p-3">
                        {onBack && targetRuleName === dim.title && (
                          <button onClick={onBack} className="mb-2 flex items-center gap-1 rounded-md border border-[#4b7ff0] bg-[#eaf2ff] px-2.5 py-1.5 text-[10px] font-medium text-[#3562c8] hover:bg-[#dceeff] w-full justify-center">
                            <ChevronRight className="size-3 rotate-180" />返回复核结果
                          </button>
                        )}
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

function RulesPage({ commonCats, setCommonCats, privateCats, setPrivateCats, targetRuleName, onTargetConsumed, onBack }: {
  commonCats: Cat[]; setCommonCats: React.Dispatch<React.SetStateAction<Cat[]>>;
  privateCats: Cat[]; setPrivateCats: React.Dispatch<React.SetStateAction<Cat[]>>;
  targetRuleName: string | null; onTargetConsumed: () => void;
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
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mb-3 flex w-fit rounded-md border border-[#dfe5ea] bg-white p-0.5">
          <button onClick={() => setTab("common")} className={`rounded px-3 py-1.5 text-[11px] transition ${tab === "common" ? "bg-[#eaf2ff] font-medium text-[#3e72df]" : "text-[#778594]"}`}>通用质检规则列表</button>
          <button onClick={() => setTab("private")} className={`rounded px-3 py-1.5 text-[11px] transition ${tab === "private" ? "bg-[#eaf2ff] font-medium text-[#3e72df]" : "text-[#778594]"}`}>专用质检规则列表</button>
        </div>
        {tab === "common" ? (
          <RulesList label="通用规则" sublabel="适用于全部客服会话的基础质检要求" cats={commonCats} setCats={setCommonCats} targetRuleName={tab === "common" ? targetRuleName : null} onTargetConsumed={onTargetConsumed} onBack={onBack}/>
        ) : (
          <RulesList label="专用规则" sublabel="仅对指定业务线、活动或场景生效" cats={privateCats} setCats={setPrivateCats} targetRuleName={tab === "private" ? targetRuleName : null} onTargetConsumed={onTargetConsumed} onBack={onBack}/>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("quality");
  const [closed, setClosed] = useState(false);
  const [targetRuleName, setTargetRuleName] = useState<string | null>(null);
  const [backToQuality, setBackToQuality] = useState(false);
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
        <PluginSidebar view={view} setView={setView} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-[#edf0f2] bg-[#fbfcfd] px-3">
            <span className="text-[10px] text-[#9aa5b0]">
              浏览器插件 · 客服质检助手
            </span>
            <button
              onClick={() => setClosed(true)}
              className="text-[#85919d] hover:text-[#3e4c5a]"
            >
              <X className="size-3.5" />
            </button>
          </div>
          {view === "quality"
            ? <QualityHome commonCats={commonCats} privateCats={privateCats} onGoToRule={(name) => { setTargetRuleName(name); setBackToQuality(true); setView("rules"); }}/>
            : <RulesPage commonCats={commonCats} setCommonCats={setCommonCats} privateCats={privateCats} setPrivateCats={setPrivateCats} targetRuleName={targetRuleName} onTargetConsumed={() => setTargetRuleName(null)} onBack={backToQuality ? () => { setView("quality"); setBackToQuality(false); } : undefined}/>
          }
        </div>
      </section>
    </main>
  );
}