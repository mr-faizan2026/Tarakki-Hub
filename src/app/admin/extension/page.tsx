import type { Metadata } from "next";
import { requireAdminData } from "@/lib/admin";
import { Card, PageHeader } from "@/components/dashboard/Card";
import { Icon } from "@/components/ui/Icon";
import { formatDateTime } from "@/lib/format";
import {
  AdapterConfigForm,
  KillSwitchForm,
  VersionGatesForm,
} from "@/components/admin/ExtensionControls";
import type { AdapterConfigPayload, KillSwitchMap } from "@/lib/extension-protocol";

export const metadata: Metadata = { title: "Extension" };

/**
 * /admin/extension — the extension's control plane.
 *
 * Three things live here, and together they are the answer to "Meesho changed
 * their form and every seller's autofill broke on a Tuesday":
 *
 *   1. ADAPTER CONFIG — selectors, label words and timings, as data. Edit it,
 *      save, and every installed extension picks it up at its next heartbeat.
 *      No new build, no Web Store review. The extension validates what arrives
 *      and falls back to its bundled defaults if it doesn't like it, so a bad
 *      paste here degrades to "the old behaviour", never to a broken extension.
 *
 *   2. KILL SWITCHES — turn one feature off for everyone, with the message its
 *      card shows. The right move when the adapter is getting something *wrong*
 *      rather than merely failing to find it.
 *
 *   3. VERSION GATES — the floor below which an install refuses to run, and the
 *      latest published version it mentions quietly.
 *
 * Underneath: what the installed extensions are actually reporting. A check that
 * suddenly reads `not_found` across many devices is a Meesho UI change, and this
 * table is how you see it before the support messages arrive.
 */

type EventRow = {
  feature: string;
  check_key: string;
  status: "ok" | "not_found" | "error";
  device_id: string | null;
  ext_version: string | null;
  path: string | null;
  detail: string | null;
  created_at: string;
};

type Health = {
  feature: string;
  check: string;
  ok: number;
  notFound: number;
  error: number;
  devices: number;
  lastSeen: string;
  lastPath: string | null;
  lastDetail: string | null;
};

/** Group the last N raw events into one row per (feature, check). */
function summarise(rows: EventRow[]): Health[] {
  const byKey = new Map<string, Health & { deviceIds: Set<string> }>();
  for (const row of rows) {
    const key = `${row.feature}|${row.check_key}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        feature: row.feature,
        check: row.check_key,
        ok: 0,
        notFound: 0,
        error: 0,
        devices: 0,
        lastSeen: row.created_at,
        lastPath: row.path,
        lastDetail: row.detail,
        deviceIds: new Set<string>(),
      };
      byKey.set(key, entry);
    }
    if (row.status === "ok") entry.ok += 1;
    else if (row.status === "not_found") entry.notFound += 1;
    else entry.error += 1;
    if (row.device_id) entry.deviceIds.add(row.device_id);
    // Rows arrive newest-first, so the first one seen is the latest.
    if (row.created_at > entry.lastSeen) {
      entry.lastSeen = row.created_at;
      entry.lastPath = row.path;
      entry.lastDetail = row.detail;
    }
  }

  return [...byKey.values()]
    .map(({ deviceIds, ...rest }) => ({ ...rest, devices: deviceIds.size }))
    // Worst first: a check that is failing everywhere is the thing to look at.
    .sort((a, b) => {
      const fa = a.notFound + a.error;
      const fb = b.notFound + b.error;
      if (fa !== fb) return fb - fa;
      return a.feature.localeCompare(b.feature);
    });
}

function healthRate(row: Health): number {
  const total = row.ok + row.notFound + row.error;
  return total === 0 ? 0 : Math.round((row.ok / total) * 100);
}

export default async function AdminExtensionPage() {
  const { db } = await requireAdminData();

  const [{ data: settingRows }, { data: eventRows }, { count: deviceCount }] =
    await Promise.all([
      db
        .from("app_settings")
        .select("key, value")
        .in("key", [
          "adapter_config",
          "kill_switches",
          "ext_min_version",
          "ext_latest_version",
          "ext_device_limit",
        ]),
      db
        .from("extension_events")
        .select("feature, check_key, status, device_id, ext_version, path, detail, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("extension_devices")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
    ]);

  const settings = new Map((settingRows ?? []).map((r) => [r.key, r.value]));

  const adapter = (settings.get("adapter_config") ?? { version: 1 }) as AdapterConfigPayload;
  const killSwitches = (settings.get("kill_switches") ?? {}) as KillSwitchMap;
  const minVersion = String(settings.get("ext_min_version") ?? "0.0.0");
  const latestVersion = String(settings.get("ext_latest_version") ?? "0.0.0");
  const deviceLimit = Number(settings.get("ext_device_limit") ?? 2);

  const health = summarise((eventRows ?? []) as EventRow[]);
  const disabled = Object.entries(killSwitches).filter(([, v]) => v && !v.enabled);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Extension"
        description="Fix Meesho selectors, pause a feature, or set the version floor — without shipping a new build. Installed extensions pick changes up at their next heartbeat."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <p className="text-micro font-medium uppercase tracking-wide text-ink-500">
            Active installs
          </p>
          <p className="mt-1 font-display text-h2 font-semibold tabular-nums text-ink-900">
            {deviceCount ?? 0}
          </p>
        </Card>
        <Card>
          <p className="text-micro font-medium uppercase tracking-wide text-ink-500">
            Adapter config version
          </p>
          <p className="mt-1 font-display text-h2 font-semibold tabular-nums text-ink-900">
            {adapter.version ?? 0}
          </p>
        </Card>
        <Card>
          <p className="text-micro font-medium uppercase tracking-wide text-ink-500">
            Features paused
          </p>
          <p
            className={`mt-1 font-display text-h2 font-semibold tabular-nums ${
              disabled.length ? "text-amber-600" : "text-ink-900"
            }`}
          >
            {disabled.length}
          </p>
          {disabled.length ? (
            <p className="mt-1 text-micro text-ink-500">
              {disabled.map(([k]) => k.replace(/_/g, " ")).join(", ")}
            </p>
          ) : null}
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-2.5">
          <Icon name="sliders" size={18} className="text-ink-400" />
          <h2 className="font-display text-h4 font-semibold text-ink-900">
            Meesho adapter config
          </h2>
        </div>
        <p className="mt-1 max-w-3xl text-small text-ink-500">
          Selectors, label words and timings, as <strong>data</strong>. The extension
          merges these over its bundled defaults, validates them, and falls back to
          the defaults on anything invalid — so a bad paste degrades to the old
          behaviour rather than breaking the extension. Nothing here is ever executed
          as code. Saving bumps the version, which is what makes installed
          extensions re-fetch.
        </p>
        <div className="mt-4">
          <AdapterConfigForm
            current={JSON.stringify(adapter, null, 2)}
            version={Number(adapter.version ?? 0)}
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2.5">
            <Icon name="ban" size={18} className="text-ink-400" />
            <h2 className="font-display text-h4 font-semibold text-ink-900">
              Kill switches
            </h2>
          </div>
          <p className="mt-1 text-small text-ink-500">
            A feature switched off does nothing on the page at all, and its card in
            the panel shows your message instead.
          </p>
          <div className="mt-4">
            <KillSwitchForm current={killSwitches} />
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2.5">
            <Icon name="shield" size={18} className="text-ink-400" />
            <h2 className="font-display text-h4 font-semibold text-ink-900">
              Versions and devices
            </h2>
          </div>
          <p className="mt-1 text-small text-ink-500">
            The floor below which an install refuses to run, the latest published
            build, and how many installs one account may keep signed in.
          </p>
          <div className="mt-4">
            <VersionGatesForm
              minVersion={minVersion}
              latestVersion={latestVersion}
              deviceLimit={deviceLimit}
            />
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-2.5">
          <Icon name="chart" size={18} className="text-ink-400" />
          <h2 className="font-display text-h4 font-semibold text-ink-900">
            Adapter health
          </h2>
        </div>
        <p className="mt-1 max-w-3xl text-small text-ink-500">
          What installed extensions report finding on the real Meesho screens — the
          last 500 checks. A row that drops to a low success rate across several
          devices is a Meesho UI change: fix it in the adapter config above.
          These rows carry no form values, product details or seller data.
        </p>

        {health.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-hairline-strong px-6 py-10 text-center">
            <p className="text-small text-ink-500">
              No checks reported yet. They arrive once an install opens a supplier
              panel page.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-small">
              <thead>
                <tr className="text-left text-micro uppercase tracking-wide text-ink-500">
                  <th className="pb-2 pr-4 font-medium">Feature</th>
                  <th className="pb-2 pr-4 font-medium">Check</th>
                  <th className="pb-2 pr-4 font-medium text-right">Found</th>
                  <th className="pb-2 pr-4 font-medium text-right">Missing</th>
                  <th className="pb-2 pr-4 font-medium text-right">Errors</th>
                  <th className="pb-2 pr-4 font-medium text-right">Devices</th>
                  <th className="pb-2 pr-4 font-medium">Last screen</th>
                  <th className="pb-2 font-medium text-right">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {health.map((row) => {
                  const rate = healthRate(row);
                  return (
                    <tr
                      key={`${row.feature}|${row.check}`}
                      style={{ borderTop: "1px solid var(--color-hairline)" }}
                    >
                      <td className="py-2.5 pr-4 text-ink-700">
                        {row.feature.replace(/_/g, " ")}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-micro text-ink-900">
                          {row.check}
                        </span>
                        {row.lastDetail ? (
                          <span className="ml-2 text-micro text-ink-500">
                            {row.lastDetail}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className={`py-2.5 pr-4 text-right tabular-nums ${
                          rate >= 90 ? "text-teal-700" : rate >= 50 ? "text-amber-600" : "text-danger-600"
                        }`}
                      >
                        {row.ok} ({rate}%)
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-ink-700">
                        {row.notFound || "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-ink-700">
                        {row.error || "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-ink-700">
                        {row.devices}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-micro text-ink-500">
                        {row.lastPath ?? "—"}
                      </td>
                      <td className="py-2.5 text-right text-micro tabular-nums text-ink-400">
                        {formatDateTime(row.lastSeen)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
