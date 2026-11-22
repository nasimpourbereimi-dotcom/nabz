// Onboarding steps use replace(): once done, the back gesture never leads into them again.
import { getDB } from './db/schema';
import { fa } from './strings.fa';
import { ImportScreen } from './screens/Import';
import { TodayScreen } from './screens/Today';
import { WorkoutsScreen } from './screens/Workouts';
import { DataSettings } from './screens/DataSettings';
import { WorkoutDetail } from './screens/WorkoutDetail';
import { WrappedScreen } from './screens/Wrapped';
import { TrendsScreen } from './screens/Trends';
import { GuideScreen } from './screens/Guide';
import { IconToday, IconTrends, IconWorkouts, IconWrapped } from './ui/icons';
import { UpdateToast } from './ui/UpdateToast';
import { InstallFirst, needsInstall, ShortcutsIntro, Welcome } from './screens/Onboarding';
import { useNav, type Route, type Tab } from './nav';

const TABS: { id: Tab; Icon: typeof IconToday }[] = [
  { id: 'today', Icon: IconToday },
  { id: 'workouts', Icon: IconWorkouts },
  { id: 'trends', Icon: IconTrends },
  { id: 'wrapped', Icon: IconWrapped },
];

const TODAY: Route = { tab: 'today' };

async function startRoute(): Promise<Route> {
  const db = getDB();
  const onboarded = (await db.settings.get('onboarded'))?.value === true;
  const hasData = (await db.syncLog.count()) > 0;
  return onboarded || hasData ? TODAY : { screen: 'onboard', step: 'welcome' };
}

export function App() {
  const { route, push, replace, back } = useNav(startRoute);
  if (!route) return null;

  const finishOnboarding = async () => {
    await getDB().settings.put({ key: 'onboarded', value: true });
    replace(TODAY);
  };
  const openImport = () => push({ screen: 'import', firstRun: false });
  const openGuide = () => push({ screen: 'guide' });
  const openWorkout = (id: string) => push({ screen: 'workout', id });

  if ('screen' in route) {
    switch (route.screen) {
      case 'onboard':
        if (route.step === 'welcome') {
          return <Welcome onNext={() => replace(needsInstall() ? { screen: 'onboard', step: 'install' } : { screen: 'import', firstRun: true })} />;
        }
        if (route.step === 'install') return <InstallFirst onContinue={() => replace({ screen: 'import', firstRun: true })} />;
        return <ShortcutsIntro onDone={finishOnboarding} onGuide={openGuide} />;
      case 'workout':
        return <WorkoutDetail id={route.id} onBack={() => back({ tab: 'workouts' })} />;
      case 'guide':
        return <GuideScreen onBack={() => back(TODAY)} />;
      case 'import':
        return (
          <ImportScreen
            step={route.firstRun}
            onDone={route.firstRun ? () => replace({ screen: 'onboard', step: 'shortcuts' }) : () => back(TODAY)}
            onSkip={route.firstRun ? () => replace({ screen: 'onboard', step: 'shortcuts' }) : () => back(TODAY)}
          />
        );
      case 'data':
        return (
          <>
            <DataSettings onBack={() => back(TODAY)} onReimport={openImport} onGuide={openGuide} />
            <UpdateToast />
          </>
        );
    }
  }

  const tab = route.tab;
  return (
    <>
      {tab === 'today' && <TodayScreen onOpenData={() => push({ screen: 'data' })} onOpenImport={openImport} onGuide={openGuide} />}
      {tab === 'workouts' && <WorkoutsScreen onOpen={openWorkout} onImport={openImport} />}
      {tab === 'trends' && <TrendsScreen onOpenWorkout={openWorkout} onImport={openImport} />}
      {tab === 'wrapped' && <WrappedScreen onImport={openImport} />}
      <nav class="tabbar" aria-label={fa.mainNav}>
        {TABS.map(({ id, Icon }) => (
          <button key={id} class="tab" aria-current={tab === id ? 'page' : undefined} onClick={() => replace({ tab: id })}>
            <Icon size={22} />
            {fa.tabs[id]}
          </button>
        ))}
      </nav>
      <UpdateToast />
    </>
  );
}
