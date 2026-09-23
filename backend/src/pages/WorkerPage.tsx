import { useCareLanguage } from "@/lib/care-language";
import { useEffect, useState } from "react";
import { Button, Card, Badge } from "@/components/kit";
import { errorText, rpc } from "@/lib/diagnostics/service";
type Task = {
  id: string;
  patient_code: string;
  full_name: string;
  phone: string | null;
  status: string;
  outcome: string | null;
  due_at: string | null;
};
export function WorkerPage() {
  const { tr, label } = useCareLanguage();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    void rpc<Task[]>("c1_worker_queue", { p_offset: offset })
      .then((r) => {
        if (active) {
          setTasks(r);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [offset, version]);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">
        {tr("Follow-up workspace", "दोबारा हाल जानना")}
      </h1>
      <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
        {tr("Refresh", "नई जानकारी देखें")}
      </Button>
      {error && <p role="alert">{error}</p>}
      {busy ? (
        <p>
          {tr("Loading assigned follow-ups…", "आपको दिए गए काम आ रहे हैं…")}
        </p>
      ) : error ? null : tasks.length ? (
        tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            refresh={() => setVersion((v) => v + 1)}
          />
        ))
      ) : (
        <Card>
          {tr(
            "No follow-ups have been assigned to you.",
            "अभी आपको कोई काम नहीं दिया गया है।",
          )}
        </Card>
      )}
      <div className="flex gap-2">
        <Button
          disabled={!offset || busy}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          {tr("Previous", "पिछला")}
        </Button>
        <Button
          disabled={tasks.length < 20 || busy}
          onClick={() => setOffset(offset + 20)}
        >
          {tr("Next", "अगला")}
        </Button>
      </div>
    </div>
  );
}
function TaskCard({ task, refresh }: { task: Task; refresh: () => void }) {
  const { tr, label } = useCareLanguage();
  const [status, setStatus] = useState("CONTACTED");
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await rpc("c1_worker_outcome", {
        p_task: task.id,
        p_status: status,
        p_outcome: outcome,
      });
      setOutcome("");
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="font-semibold">
          {task.full_name} · {task.patient_code}
        </h2>
        <Badge>{label(task.status)}</Badge>
      </div>
      <p>
        {tr("Phone", "फोन")}: {task.phone ?? tr("Not recorded", "दर्ज नहीं है")}
      </p>
      <p>
        {tr("Follow-up due", "दोबारा संपर्क की तारीख")}:{" "}
        {task.due_at ? new Date(task.due_at).toLocaleString() : "Not recorded"}
      </p>
      {task.outcome && (
        <p>
          {tr("Last recorded outcome", "पिछली बार क्या हुआ")}: {task.outcome}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {!["COMPLETED", "AWAITING_VERIFICATION"].includes(task.status) && (
        <>
          <label className="block">
            {tr("Action", "किया गया काम")}
            <select
              className="w-full rounded border p-3"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="CONTACTED">
                {tr("Contact recorded", "संपर्क किया गया")}
              </option>
              <option value="VISITED">
                {tr("Visit recorded", "मुलाकात हुई")}
              </option>
              <option value="ESCALATED">
                {tr("Escalate to doctor", "डॉक्टर को ध्यान देने के लिए भेजें")}
              </option>
              <option value="AWAITING_VERIFICATION">
                {tr(
                  "Submit outcome for doctor verification",
                  "नतीजा डॉक्टर को जाँचने के लिए भेजें",
                )}
              </option>
            </select>
          </label>
          <label className="block">
            {tr("Actual outcome", "वास्तव में क्या हुआ")}
            <textarea
              className="w-full rounded border p-3"
              maxLength={2000}
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
            />
          </label>
          <Button
            disabled={busy || !outcome.trim()}
            onClick={() => void save()}
          >
            {tr("Record outcome", "नतीजा दर्ज करें")}
          </Button>
        </>
      )}
      <p className="text-sm text-muted-foreground">
        {tr(
          "Contact or a visit does not close the follow-up. The assigned doctor verifies completion.",
          "संपर्क या मुलाकात से काम पूरा नहीं माना जाता। जिम्मेदार डॉक्टर नतीजा जाँचकर इसे पूरा मानते हैं।",
        )}
      </p>
    </Card>
  );
}
