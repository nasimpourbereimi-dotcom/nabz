import { useEffect, useState } from 'preact/hooks';
import { getDB } from './db/schema';
import { fa } from './strings.fa';
import { ImportScreen } from './screens/Import';
import { TodayScreen } from './screens/Today';
import { WorkoutsScreen } from './screens/Workouts';
import { DataSettings } from './screens/DataSettings';
import { WorkoutDetail } from './screens/WorkoutDetail';
import { WrappedScreen } from './screens/Wrapped';
import { TrendsScreen } from './screens/Trends';
import { IconToday, IconTrends, IconWorkouts, IconWrapped } from './ui/icons';
import { UpdateToast } from './ui/UpdateToast';
import { InstallFirst, needsInstall, ShortcutsIntro, Welcome } from './screens/Onboarding';

type Tab = 'today' | 'workouts' | 'trends' | 'wrapped';
type Onboard = 'welcome' | 'install' | 'shortcuts';
type Route = { tab: Tab } | { screen: 'data' } | { screen: 'import'; firstRun: boolean } | { screen: 'workout'; id: string; back?: Tab } | { screen: 'onboard'; step: Onboard };

const TABS: { id: Tab; Icon: typeof IconToday }[] = [
  { id: 'today', Icon: IconToday },
  { id: 'workouts', Icon: IconWorkouts },
  { id: 'trends', Icon: IconTrends },
  { id: 'wrapped', Icon: IconWrapped },
];

export function App() {
  const [route, setRoute] = useState<Route | null>(null);

  useEffect(() => {
    (async () => {
      const db = getDB();
      const onboarded = (await db.settings.get('onboarded'))?.value === true;
      const hasData = (await db.syncLog.count()) > 0;
      setRoute(onboarded || hasData ? { tab: 'today' } : { screen: 'onboard', step: 'welcome' });
    })();
  }, []);

  if (!route) return null;

  const finishOnboarding = async () => {
    await getDB().settings.put({ key: 'onboarded', value: true });
    setRoute({ tab: 'today' });
  };

  if ('screen' in route) {
    if (route.screen === 'onboard') {
      if (route.step === 'welcome') {
        return <Welcome onNext={() => setRoute(needsInstall() ? { screen: 'onboard', step: 'install' } : { screen: 'import', firstRun: true })} />;
      }
      if (route.step === 'install') return <InstallFirst onContinue={() => setRoute({ screen: 'import', firstRun: true })} />;
      return <ShortcutsIntro onDone={finishOnboarding} />;
    }
    if (route.screen === 'workout') {
      return <WorkoutDetail id={route.id} onBack={() => setRoute({ tab: route.back ?? 'workouts' })} />;
    }
    if (route.screen === 'import') {
      return (
        <ImportScreen
          step={route.firstRun}
          onDone={route.firstRun ? () => setRoute({ screen: 'onboard', step: 'shortcuts' }) : finishOnboarding}
          onSkip={route.firstRun ? () => setRoute({ screen: 'onboard', step: 'shortcuts' }) : () => setRoute({ screen: 'data' })}
        />
      );
    }
    return (
      <>
        <DataSettings onBack={() => setRoute({ tab: 'today' })} onReimport={() => setRoute({ screen: 'import', firstRun: false })} />
        <UpdateToast />
      </>
    );
  }

  const tab = route.tab;
  return (
    <>
      {tab === 'today' && <TodayScreen onOpenData={() => setRoute({ screen: 'data' })} onOpenImport={() => setRoute({ screen: 'import', firstRun: false })} />}
      {tab === 'workouts' && <WorkoutsScreen onOpen={(id) => setRoute({ screen: 'workout', id })} onImport={() => setRoute({ screen: 'import', firstRun: false })} />}
      {tab === 'trends' && <TrendsScreen onOpenWorkout={(id) => setRoute({ screen: 'workout', id, back: 'trends' })} onImport={() => setRoute({ screen: 'import', firstRun: false })} />}
      {tab === 'wrapped' && <WrappedScreen onImport={() => setRoute({ screen: 'import', firstRun: false })} />}
      <nav class="tabbar" aria-label={fa.mainNav}>
        {TABS.map(({ id, Icon }) => (
          <button key={id} class="tab" aria-current={tab === id ? 'page' : undefined} onClick={() => setRoute({ tab: id })}>
            <Icon size={22} />
            {fa.tabs[id]}
          </button>
        ))}
      </nav>
      <UpdateToast />
    </>
  );
}
