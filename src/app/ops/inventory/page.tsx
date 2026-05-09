export default function InventoryPage() {
  const items = [
    "מדף קמח",
    "מדף סוכר",
    "מדף מגשים",
    "מדף אריזות",
    "מדף חומרי ניקוי",
  ];

  return (
    <div className="mx-auto max-w-7xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-bold tracking-[0.12em] text-indigo-700">ספירת מלאי</p>
      <h1 className="mt-3 text-3xl font-black text-slate-950">
        ספירת מלאי יומית לתחילת משמרת
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        מסך מהיר להזנת כמויות פתיחה במדפי המפעל לפני תחילת עבודה.
      </p>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <label
            key={item}
            className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
          >
            <span className="font-semibold text-slate-800">{item}</span>
            <input
              type="number"
              min={0}
              className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-right"
              placeholder="כמות"
            />
          </label>
        ))}
      </div>
      <button className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 font-bold text-white hover:bg-slate-800">
        שמירת ספירת פתיחה
      </button>
    </div>
  );
}
