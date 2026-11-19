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

type Tab = 'today' | 'workouts' | 'trends' | 'wrapped';
type Route = { tab: Tab } | { screen: 'data' } | { screen: 'import'; firstRun: boolean } | { screen: 'workout'; id: string; back?: Tab };

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
      setRoute(onboarded || hasData ? { tab: 'today' } : { screen: 'import', firstRun: true });
    })();
  }, []);

  if (!route) return null;

  const finishOnboarding = async () => {
    await getDB().settings.put({ key: 'onboarded', value: true });
    setRoute({ tab: 'today' });
  };

  if ('screen' in route) {
    if (route.screen === 'workout') {
      return <WorkoutDetail id={route.id} onBack={() => setRoute({ tab: route.back ?? 'workouts' })} />;
    }
    if (route.screen === 'import') {
      return (
        <ImportScreen
          step={route.firstRun}
          onDone={finishOnboarding}
          onSkip={route.firstRun ? finishOnboarding : () => setRoute({ screen: 'data' })}
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
      {tab === 'workouts' && <WorkoutsScreen onOpen={(id) => setRoute({ screen: 'workout', id })} />}
      {tab === 'trends' && <TrendsScreen onOpenWorkout={(id) => setRoute({ screen: 'workout', id, back: 'trends' })} />}
      {tab === 'wrapped' && <WrappedScreen />}
      <nav class="tabbar" aria-label="tabs">
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
