const FORECAST_LOAD_MESSAGE = "שגיאה בטעינת נתוני התזרים";

export function forecastLoadErrorResponse(status = 500) {
  return Response.json(
    {
      success: false,
      ok: false,
      message: FORECAST_LOAD_MESSAGE,
    },
    { status },
  );
}

export function forecastSaveErrorResponse(message = "שגיאה בשמירת יתרת הבנק") {
  return Response.json(
    {
      success: false,
      ok: false,
      message,
    },
    { status: 500 },
  );
}

export function isForecastMigrationError(e: unknown): boolean {
  return e instanceof Error && e.message === "MIGRATION_REQUIRED";
}
