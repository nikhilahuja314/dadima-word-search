import { ACTIVITIES } from '../activities/registry';
import { h } from './util';

export const HOME_TITLE = 'Activities for Dadima';

export function renderHome(root: HTMLElement): void {
  document.title = HOME_TITLE;
  const tiles = ACTIVITIES.map((activity) => {
    const icon = h('span', { className: 'tile-icon' });
    icon.innerHTML = activity.icon;
    return h(
      'li',
      {},
      h(
        'a',
        { className: 'tile', href: `#/${activity.id}` },
        icon,
        h(
          'span',
          { className: 'tile-text' },
          h('span', { className: 'tile-title' }, activity.title),
          h('span', { className: 'tile-tagline' }, activity.tagline),
        ),
      ),
    );
  });
  root.replaceChildren(
    h('h1', {}, HOME_TITLE),
    h('p', { className: 'intro' }, 'Pick something to print.'),
    h('ul', { className: 'tiles' }, ...tiles),
  );
}
