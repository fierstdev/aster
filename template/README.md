# **APP_NAME**

## Run the app

Run `vp install`, then `vp dev`. Open the local URL printed in the terminal.
Edit `src/main.tsx` and save to see your changes. The counter in `src/counter.tsx`
shows how a generator component keeps local state between renders.
The welcome page's styles live in `src/styles.css`.

## Add a UI component

Run `npm run ui -- add button` and install the dependencies printed by the CLI.
In `src/main.tsx`, import `Button` from `./ui/button` and render
`<Button variant="primary">Continue</Button>`. You own the files in `src/ui/`
and can edit them directly. The starter loads the theme stylesheet automatically.

## Build for production

Run `vp check` to check formatting, lint, and types. Run `vp build` to write the
production site to `dist/`, then `vp preview` to try that build locally.

Explore the [interactive lessons](https://aster.fierst.dev/learn) and
[Aster guides](https://github.com/fierstdev/aster/tree/main/docs/guides).
