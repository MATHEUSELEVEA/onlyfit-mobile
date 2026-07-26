import { useState } from 'react';
import { clsx } from 'clsx';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { MyFitSectionNav } from '@/features/meufit/MyFitSectionNav';
import { HealthProfileView } from './HealthProfilePage';
import { HealthRecordFlow } from './NewHealthRecordPage';

type Tab = 'record' | 'profile';

const tabs: [Tab, string][] = [
  ['record', 'Registro'],
  ['profile', 'Ficha de saúde'],
];

// Saúde dentro do My Fit: registrar um evento e consultar a ficha sem trocar de
// tela — o mesmo formulário e a mesma ficha das rotas dedicadas, em abas.
export function MyFitHealthPage() {
  const [tab, setTab] = useState<Tab>('record');
  const [formKey, setFormKey] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);

  function handleSaved() {
    setShowSuccess(true);
    setFormKey((current) => current + 1);
    setTab('profile');
  }

  return (
    <div className="relative flex h-full flex-col overflow-y-auto bg-background pb-8">
      <PageTopBar title="Saúde" backFallback="/meu-fit" />
      <main className="mx-auto w-full max-w-[720px] px-5 pb-6 pt-5">
        <MyFitSectionNav />
        <div className="grid grid-cols-2 border-b border-outline-variant/30" role="tablist" aria-label="Seções da saúde">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={clsx(
                'relative flex min-h-[44px] items-center justify-center font-sans text-label transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                tab === value ? 'text-on-surface' : 'text-on-surface-variant active:text-on-surface',
              )}
            >
              {label}
              {tab === value ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" aria-hidden /> : null}
            </button>
          ))}
        </div>

        <div className="-mx-1">
          {tab === 'record' ? <HealthRecordFlow key={formKey} embedded onSaved={handleSaved} /> : null}
          {tab === 'profile' ? <HealthProfileView embedded onAddRecord={() => setTab('record')} /> : null}
        </div>
      </main>

      <BottomSheet
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        title="Registro realizado com sucesso"
        description="O registro foi salvo na sua ficha de saúde."
      >
        <div className="px-5 pb-5 pt-4">
          <button
            type="button"
            onClick={() => setShowSuccess(false)}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-5 font-sans text-label text-on-primary transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            OK
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
