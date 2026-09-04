import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Loader2, Network, WalletCards } from "lucide-react";
import { useState } from "react";
import { PageTopBar } from "@/components/layout/PageTopBar";
import { supabase } from "@/lib/supabase";
import { useMyProfile } from "@/features/profile/useMyProfile";

type Context = {
  program: { network_enabled: boolean; onboarding_enabled: boolean };
  affinity_groups: Array<{ key: string; label: string }>;
  associates: Array<{
    assignment_id: string;
    profile: { name: string; username: string };
    badge_label: string;
  }>;
  location?: { region: { name: string } | null };
  principal_reviewer?: { profile: { name: string; username: string } } | null;
  can_submit_without_associate: boolean;
  membership?: { status: string } | null;
};

export function AmbassadorNetworkPage() {
  const { data: profile } = useMyProfile();
  const client = useQueryClient();
  const [vertical, setVertical] = useState("");
  const [country, setCountry] = useState("BR");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [associateChoice, setAssociateChoice] = useState<string | null>(null);
  const context = useQuery({
    queryKey: ["ambassador-onboarding", vertical, country, state, city],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_my_ambassador_onboarding_context" as never,
        {
          p_affinity_group_key: vertical || null,
          p_country_code: country || null,
          p_state_code: state || null,
          p_city_name: city || null,
        } as never,
      );
      if (error) throw error;
      return data as unknown as Context;
    },
    staleTime: 15_000,
    enabled: profile?.isProfessional === true,
  });
  const request = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "request_professional_ambassador_membership" as never,
        {
          p_affinity_group_key: vertical,
          p_country_code: country,
          p_state_code: state || null,
          p_city_name: city || null,
          p_associate_assignment_id:
            associateChoice === "none" ? null : associateChoice,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["ambassador-onboarding"] }),
  });
  const existing = context.data?.membership;
  if (profile && !profile.isProfessional) {
    return (
      <div className="h-full overflow-y-auto bg-background">
        <PageTopBar title="Rede de Embaixadores" backFallback="/perfil/menu" />
        <main className="mx-auto max-w-[720px] px-6 py-6">
          <p className="rounded-2xl border bg-surface p-5">
            Este fluxo está disponível somente no perfil profissional.
          </p>
        </main>
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <PageTopBar title="Rede de Embaixadores" backFallback="/perfil/menu" />
      <main className="mx-auto max-w-[720px] space-y-5 px-6 py-6">
        <section className="rounded-2xl border border-outline-variant/40 bg-surface p-5">
          <div className="mb-3 flex items-center gap-3">
            <Network className="text-primary" />
            <div>
              <h1 className="font-semibold">Sua rede profissional</h1>
              <p className="text-sm text-on-surface-variant">
                Escolha uma vertical e encontre a liderança contratual da sua
                região.
              </p>
            </div>
          </div>
          {!context.data?.program.onboarding_enabled ? (
            <p className="rounded-xl bg-surface-container p-3 text-sm">
              Novas solicitações estão temporariamente pausadas.
            </p>
          ) : null}
          {existing ? (
            <div className="flex items-center gap-2 rounded-xl bg-primary/10 p-3">
              <BadgeCheck size={18} />
              <span>
                Status da solicitação: <strong>{existing.status}</strong>
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm">
                Vertical
                <select
                  className="mt-1 w-full rounded-xl border bg-background p-3"
                  value={vertical}
                  onChange={(e) => {
                    setVertical(e.target.value);
                    setAssociateChoice(null);
                  }}
                >
                  <option value="">Selecione</option>
                  {context.data?.affinity_groups.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  País
                  <input
                    className="mt-1 w-full rounded-xl border bg-background p-3"
                    maxLength={2}
                    value={country}
                    onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  />
                </label>
                <label className="text-sm">
                  Estado
                  <input
                    className="mt-1 w-full rounded-xl border bg-background p-3"
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                  />
                </label>
              </div>
              <label className="block text-sm">
                Cidade
                <input
                  className="mt-1 w-full rounded-xl border bg-background p-3"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </label>
              {context.data?.location?.region ? (
                <p className="text-sm">
                  Região: <strong>{context.data.location.region.name}</strong>
                </p>
              ) : null}
              {vertical ? <p className="text-sm text-on-surface-variant">
                Escolha um Embaixador Associado pelo nome/@usuário ou prossiga sem associado.
              </p> : null}
              {context.data?.associates.map((a) => (
                <button
                  type="button"
                  key={a.assignment_id}
                  onClick={() => setAssociateChoice(a.assignment_id)}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${associateChoice === a.assignment_id ? "border-primary bg-primary/10" : ""}`}
                >
                  <span>
                    <strong>{a.profile.name}</strong>
                    <small className="block">@{a.profile.username} · {a.badge_label}</small>
                  </span>
                </button>
              ))}
              {vertical ? <button
                type="button"
                disabled={!context.data?.can_submit_without_associate}
                onClick={() => setAssociateChoice("none")}
                className={`w-full rounded-xl border p-3 text-left disabled:opacity-50 ${associateChoice === "none" ? "border-primary bg-primary/10" : ""}`}
              >
                <strong>Nenhum Embaixador Associado</strong>
                <small className="block">
                  {context.data?.can_submit_without_associate
                    ? `A solicitação será analisada pelo Principal${context.data.principal_reviewer ? `, ${context.data.principal_reviewer.profile.name}` : ""}.`
                    : "Esta vertical ainda não possui Principal disponível para análise."}
                </small>
              </button> : null}
              <button
                className="w-full rounded-xl bg-primary p-3 font-semibold text-on-primary disabled:opacity-50"
                disabled={
                  !vertical ||
                  !country ||
                  associateChoice === null ||
                  request.isPending ||
                  !context.data?.program.onboarding_enabled
                }
                onClick={() => request.mutate()}
              >
                {request.isPending ? (
                  <Loader2 className="mx-auto animate-spin" />
                ) : (
                  "Enviar solicitação"
                )}
              </button>
              {request.isError ? (
                <p role="alert" className="text-sm text-error">
                  Não foi possível enviar. Revise os dados e tente novamente.
                </p>
              ) : null}
            </div>
          )}
        </section>
        <section className="rounded-2xl border border-outline-variant/40 bg-surface p-5">
          <div className="flex gap-3">
            <WalletCards className="text-on-surface-variant" />
            <div>
              <h2 className="font-semibold">Financeiro</h2>
              <p className="text-sm text-on-surface-variant">
                Infraestrutura preparada. Valores, saldo e repasses permanecem
                indisponíveis até a ativação dos pagamentos.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
