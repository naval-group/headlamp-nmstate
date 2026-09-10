/**
 * Offline icon bundle for air-gapped environments.
 *
 * Registers every MDI icon the plugin renders so @iconify/react never reaches
 * for the Iconify CDN at runtime — without this, an air-gapped install shows
 * blank squares where icons should be.
 *
 * Regenerate with `node scripts/extract-icons.mjs` after adding an icon;
 * see that script for the procedure.
 *
 * Imported once, from the plugin entry point.
 */
import { addCollection } from '@iconify/react';
import mdiIcons from './mdi-icons.json';

addCollection(mdiIcons);
