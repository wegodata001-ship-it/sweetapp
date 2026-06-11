import { Suspense } from "react";
import { MyNotesClient } from "./my-notes-client";

export default function MyNotesPage() {
  return (
    <Suspense fallback={null}>
      <MyNotesClient />
    </Suspense>
  );
}
