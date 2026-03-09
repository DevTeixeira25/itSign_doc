import { Suspense } from "react";
import SignPage from "./client";

export function generateStaticParams() {
  return [];
}

export default function Page() {
  return (
    <Suspense fallback={<div className="loader" style={{ margin: "48px auto" }} />}>
      <SignPage />
    </Suspense>
  );
}
