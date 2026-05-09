const workstreams = [
  {
    title: "Kanban Tasks",
    description: "Plan, prioritize, and track work orders across operations.",
    metric: "42 open cards",
  },
  {
    title: "Inventory",
    description: "Monitor stock levels, reorder points, and warehouse movement.",
    metric: "1,284 SKUs",
  },
  {
    title: "Time Attendance",
    description: "Review shifts, clock events, and attendance exceptions.",
    metric: "96% on-time",
  },
];

export default function OperationsPortalPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="app-panel p-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">
          Operations Portal
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">
          Tasks, inventory, and attendance for daily execution.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          This portal establishes the operations side of WEGO ERP V1.0 and is
          ready for module-specific workflows as the system expands.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {workstreams.map((workstream) => (
          <div
            key={workstream.title}
            className="app-panel p-6"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              Operations
            </p>
            <h2 className="mt-3 text-2xl font-black text-slate-950">
              {workstream.title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {workstream.description}
            </p>
            <p className="mt-6 rounded-full bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700">
              {workstream.metric}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
