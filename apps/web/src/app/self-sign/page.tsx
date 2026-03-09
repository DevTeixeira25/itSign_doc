import { Suspense } from "react";
import SelfSignPage from "./client";

export default function Page() {
  return (
    <Suspense fallback={
      <main className="container" style={{ maxWidth: 960 }}>
        <div className="card text-center" style={{ padding: "48px 32px" }}>
          <div className="loader" style={{ margin: "0 auto 16px" }} />
          <h2>Carregando...</h2>
        </div>
      </main>
    }>
      <SelfSignPage />
    </Suspense>
  );
}