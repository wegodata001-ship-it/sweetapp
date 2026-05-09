export default function CashflowPage() {
  const rows = [
    { date: "09/05/2026", source: "חשבונית 9012", incoming: 5400, outgoing: 0 },
    { date: "09/05/2026", source: "תשלום לספק אפייה", incoming: 0, outgoing: 2100 },
    { date: "09/05/2026", source: "דוח Z ערב", incoming: 3200, outgoing: 0 },
    { date: "09/05/2026", source: "הוצאות שילוח", incoming: 0, outgoing: 680 },
  ];

  let runningBalance = 18500;

  return (
    <div className="mx-auto max-w-7xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-bold tracking-[0.12em] text-cyan-700">תזרים מזומנים</p>
      <h1 className="mt-3 text-3xl font-black text-slate-950">מעקב הכנסות והוצאות</h1>
      <p className="mt-2 text-sm text-slate-600">
        טבלת תזרים מודרנית לניטור תנועות נכנסות/יוצאות וחישוב יתרה רצה בזמן אמת.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-bold text-slate-600">תאריך</th>
              <th className="px-4 py-3 font-bold text-slate-600">מקור</th>
              <th className="px-4 py-3 font-bold text-emerald-700">נכנס</th>
              <th className="px-4 py-3 font-bold text-rose-700">יוצא</th>
              <th className="px-4 py-3 font-bold text-slate-900">יתרה רצה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              runningBalance += row.incoming - row.outgoing;
              return (
                <tr key={row.source}>
                  <td className="px-4 py-3 text-slate-700">{row.date}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.source}</td>
                  <td className="px-4 py-3 font-bold text-emerald-700">
                    {row.incoming ? `₪${row.incoming.toLocaleString("he-IL")}` : "-"}
                  </td>
                  <td className="px-4 py-3 font-bold text-rose-700">
                    {row.outgoing ? `₪${row.outgoing.toLocaleString("he-IL")}` : "-"}
                  </td>
                  <td className="px-4 py-3 font-black text-slate-900">
                    ₪{runningBalance.toLocaleString("he-IL")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
