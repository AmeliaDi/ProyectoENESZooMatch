"use client";

/**
 * Admin console shell (ADR-036): checks the console session, then offers
 * four tabs: aggregates, people, reports and the audit trail. Every write
 * is audited on the server; the UI only consumes validated DTOs.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { IdentityDto } from "@/contracts/identity";
import { formatIdentity } from "@/domain/identity/format-identity";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Button } from "@/ui/kit/button";
import { LoadingState } from "@/ui/kit/states";
import { Tabs } from "@/ui/kit/tabs";
import { isHatched } from "@/ui/shared/parse-identity";

import { adminApi } from "./admin-api";
import { ADMIN_COPY, TAB_LABELS, type AdminTab } from "./admin-copy";
import { AdminDashboard } from "./admin-dashboard";
import { AuditPanel } from "./audit-panel";
import { ReportsPanel } from "./reports-panel";
import { UsersPanel } from "./users-panel";

const TABS = (Object.keys(TAB_LABELS) as AdminTab[]).map((key) => ({ key, label: TAB_LABELS[key] }));
const ID = "zm-admin";

export function AdminConsole() {
  const router = useRouter();
  const [identity, setIdentity] = useState<IdentityDto | undefined>(undefined);
  const [tab, setTab] = useState<AdminTab>("users");

  const toLogin = useCallback(() => router.replace("/admin/login"), [router]);

  useEffect(() => {
    let alive = true;
    void adminApi.session().then((result) => {
      if (!alive) return;
      if (result.ok) setIdentity(result.value.identity);
      else toLogin();
    });
    return () => {
      alive = false;
    };
  }, [toLogin]);

  async function logout() {
    await adminApi.logout();
    toLogin();
  }

  if (identity === undefined) {
    return (
      <AtlasShell plate={ADMIN_COPY.plate}>
        <main className="zm-center">
          <LoadingState />
        </main>
      </AtlasShell>
    );
  }

  // An admin still in the egg has no pseudonymous name to sign in with.
  const sessionName = isHatched(identity) ? ` · ${formatIdentity(identity).title}` : "";

  return (
    <AtlasShell
      plate={ADMIN_COPY.plate}
      actions={
        <Button variant="ghost" icon="logout" onClick={() => void logout()}>
          {ADMIN_COPY.logout}
        </Button>
      }
    >
      <main className="zm-admin">
        <header className="zm-admin__head">
          <h1 className="zm-settings__title">Observatorio</h1>
          <p className="zm-detail__muted">Sesión administrativa{sessionName}</p>
          <Tabs items={TABS} value={tab} onChange={setTab} label={ADMIN_COPY.tabsLabel} idPrefix={ID} />
        </header>
        <section role="tabpanel" id={`${ID}-panel-${tab}`} aria-labelledby={`${ID}-tab-${tab}`}>
          {tab === "metrics" ? <AdminDashboard onUnauthorized={toLogin} /> : null}
          {tab === "users" ? <UsersPanel onUnauthorized={toLogin} /> : null}
          {tab === "reports" ? <ReportsPanel onUnauthorized={toLogin} /> : null}
          {tab === "audit" ? <AuditPanel onUnauthorized={toLogin} /> : null}
        </section>
      </main>
    </AtlasShell>
  );
}
