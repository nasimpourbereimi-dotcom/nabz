import { render } from 'preact';
import '@fontsource/vazirmatn/300.css';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource/vazirmatn/900.css';
import './styles/global.css';
import { App } from './app';
import { registerSW } from './ui/UpdateToast';
import { loadAccent } from './ui/SettingsSections';
import { installGlobalHandlers } from './lib/errorLog';
import { ErrorBoundary } from './ui/ErrorBoundary';

loadAccent().catch(() => {});
installGlobalHandlers();
render(<ErrorBoundary><App /></ErrorBoundary>, document.getElementById('app')!);
registerSW();
