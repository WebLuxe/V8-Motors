// Publishes the built site to the gh-pages branch (GitHub Pages serves it from there). node scripts/deploy.mjs [folder], dist by default.
import { execSync } from 'node:child_process';
import { writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const remote = execSync('git remote get-url origin').toString().trim();
const dist = process.argv[2] || 'dist';

// The car photos come from the stock sync and aren't kept in git. A build made where the stock API couldn't be reached, on a
// machine that has never synced, has none, and publishing it would empty every car card. Refuse instead.
const { cars } = JSON.parse(readFileSync('src/inventory.json', 'utf8'));
const missing = cars.flatMap((c) => c.thumbs || []).filter((t) => !existsSync(`${dist}/${t}`));
if (missing.length) {
  console.error(`Not deploying: ${missing.length} car photos are missing from ${dist}/ (first: ${missing[0]}). Run npm run sync where the stock API can be reached, then deploy again.`);
  process.exit(1);
}

writeFileSync(`${dist}/.nojekyll`, ''); // let Pages serve files as-is
rmSync(`${dist}/.git`, { recursive: true, force: true });
run('git init -q -b gh-pages', { cwd: dist });
run('git add -A', { cwd: dist });
run('git -c user.name="V8 Motors deploy" -c user.email="deploy@users.noreply.github.com" commit -q -m "Deploy site"', { cwd: dist });
run(`git push -f ${remote} gh-pages`, { cwd: dist });
rmSync(`${dist}/.git`, { recursive: true, force: true });
console.log('Deployed to gh-pages.');
