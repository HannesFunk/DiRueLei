## Deployment of this Fork

### Main / Production Instance - Cloudflare Pages
* Triggered by any push on branch `master`.
* Runs `./build.sh` and deploys the resulting directory.
* Hosted at: https://diruelei.valentin-herrmann.com/
* Every version stays available at `https://[hash].diruelei.pages.dev` even if later versions are deployed.

### Development / Preview Instance - Cloudflare Pages
* Triggered by any push on non-production branches.
* Runs `./build.sh` and deploys the resulting directory.
* Hosted at: `https://[branch].diruelei.pages.dev`
* Every version stays available at `https://[hash].diruelei.pages.dev` even if later versions are deployed.

### Backup Instance - Github Pages
* Triggered by any push on branch `master`.
* Deploys the resulting directory as is! `./build.sh` needs to be executed locally!
* Hosted at: https://valentinherrmann.github.io/DiRueLei/
* New Deployment fully overwrite this instance
