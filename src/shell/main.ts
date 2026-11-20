import { findActivity } from '../activities/registry';
import { renderActivityPage } from './activity-page';
import { renderHome } from './home';

const root = document.getElementById('app');
if (!root) throw new Error('Missing element #app');
const app: HTMLElement = root;

/** Hash routes (`#/`, `#/word-search`) so the static GitHub Pages build needs no server rewrites. */
function route(): void {
  const id = location.hash.replace(/^#\/?/, '');
  const activity = id ? findActivity(id) : undefined;
  if (id && !activity) {
    location.replace('#/');
    return;
  }
  if (activity) renderActivityPage(app, activity);
  else renderHome(app);
  window.scrollTo(0, 0);
  // Move focus to the new heading so screen readers announce the page change.
  const heading = app.querySelector('h1');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

window.addEventListener('hashchange', route);
route();
