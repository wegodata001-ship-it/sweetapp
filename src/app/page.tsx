import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-bold tracking-[0.14em] text-indigo-600">
          מרכז הבקרה
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">
          ברוכים הבאים למערכת הניהול החדשה
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          הסרגל הראשי עודכן לניווט המודולים החדשים: רישום כספי, כרטסות, תזרים,
          משימות וטפסים, ספירת מלאי וארכיון מסמכים.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/finance/register"
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            מעבר לרישום כספי
          </Link>
          <Link
            href="/worker"
            className="rounded-full border border-emerald-500 px-5 py-3 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50"
          >
            כניסה לפורטל עובד אישי
          </Link>
        </div>
      </section>
    </div>
  );
}
