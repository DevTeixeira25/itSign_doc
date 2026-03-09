import { Suspense } from "react";
import SignPage from "./client";

export default function Page() {
  return (
    <Suspense fallback={<div className="loader" style={{ margin: "48px auto" }} />}>
      <SignPage />
    </Suspense>
  );
}
