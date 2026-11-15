/** Editable project story. Narrative follows project-lead notes; technical facts follow code and archive provenance. */
// Editorial fields stay out of the public UI until filled. Add consented, factual observations only.
export const editorial = {
  projectLead: 'Luqman',
  projectLeadContribution: 'Project Lead, Research, Game Design, UI/UX Direction, Testing and Iteration',
  // Confirmed contributor credits. Credit here does not claim registered team membership.
  members: [{ name: 'Farhan', contribution: "Advisor and Code Reviewer (Luqman's father)" }],
  playtesting: [], // Future observations: age range, task, observed difficulty, change, retest. No identifying child data. Update the validation narrative when observations are added.
  mediaCredits: [], // TODO: add any external asset actually introduced, with source and permission/license.
};

export const projectLinks = {
  repository: 'https://github.com/luqman338/Moonbase-blackout',
  demo: 'https://luqman338.github.io/Moonbase-blackout/', // Public copy may lag the working version.
  challenge: 'https://www.spaceappschallenge.org/2026/challenges/junior-astronaut-mission-trainer/',
};

export const storySections = [
  { id: 'idea', title: 'One battery. Six shifts.', body: `
    <p>You control a fictional lunar outpost during a 36-hour blackout. Solar power is offline. One 92 kWh battery must last six shifts of six hours each, with no recharge.</p>
    <p>Each shift, choose one command. All three cover basic life support. Energy is measured in kilowatt-hours, or kWh.</p>
    <table id="story-rules"><caption>Three commands, one shared energy supply</caption><thead><tr><th scope="col">Command</th><th scope="col">Total cost</th><th scope="col">What it powers</th></tr></thead><tbody><tr><th scope="row">Conserve</th><td>12 kWh</td><td>Life support.</td></tr><tr><th scope="row">Greenhouse</th><td>18 kWh</td><td>Life support and one light period for plants.</td></tr><tr><th scope="row">Shelter</th><td>18 kWh</td><td>Life support and crew protection for this shift.</td></tr></tbody></table>
    <p>Your job is to keep the crew safe, shelter during the warning shift and provide at least two greenhouse light periods. Every choice leaves less energy for later. You need a plan that covers both the crew and the plants.</p>
    <p>This is Moonbase Blackout’s response to <a href="https://www.spaceappschallenge.org/2026/challenges/junior-astronaut-mission-trainer/">Build a Junior Astronaut Mission Trainer</a>: let young players take charge of competing needs at an outpost. The blackout is fictional. May 2024 refers to the NASA record used in the game.</p>
    <details><summary>Exact rules and edge cases</summary><p>Each accepted command spends its total cost once. Reading, Skip Animation and Continue spend no energy. Shelter protects only its selected shift. Six completed shifts with a safe crew and at least two light periods earn full success; fewer light periods earn partial success.</p><p>Before a shift, less than 12 kWh causes power failure. On the alert shift, less than 18 kWh prevents shelter. An unaffordable command spends nothing and adds no history entry. An affordable non-Shelter choice on the alert shift ends the mission without spending energy on that choice.</p><p>The sixth completed command ends the mission, with no seventh-shift energy requirement. Ended missions reject further actions. Retry starts at shift 1 with 92 kWh. The shelter-power-shortfall boundary is tested with constructed states; it cannot occur through normal play before this mission’s shift-3 alert.</p></details>` },
  { id: 'development', title: 'A smaller model, clearer decisions', body: `
    <ol class="story-process" aria-label="Engineering process"><li>Research</li><li>Define</li><li>Prototype</li><li>Test</li><li>Iterate</li><li>Validate</li></ol>
    <p>Before building, Luqman reviewed NASA resources, earlier Space Apps projects, educational games and interface ideas. He turned that research into a short set of requirements: choices children could understand, visible consequences and results that could be checked.</p>
    <p>The deadline forced a useful decision. Adding water, oxygen and heat would mean more rules, more testing and more readings for younger players to understand. One battery, six shifts and three commands left time to make the small model clear and reliable.</p>
    <p>The rules use fixed costs. The same choices always produce the same result. That made it possible to check a plan by hand, then use automated tests to catch mistakes in the software.</p>
    <p>Luqman directed the design and reviewed the prototypes. Codex implemented the simulation and much of the interface, tests and documentation. Farhan provided technical advice and code review. After interface changes, the rules could be checked again without depending on how the game looked.</p>` },
  { id: 'feedback', title: 'The feedback changed the priorities', body: `
    <p>The first prototype followed its rules, but children in Luqman’s community program described it as “boring.” The calculations worked. Presentation and feedback became the next design problem.</p>
    <p>That feedback shifted the work toward showing what each command did. A unified, physical-looking console replaced separate webpage-style panels. Greenhouse lights and shelter indicators made the selected system visible.</p>
    <p>The opening became five terminal transmissions, each advanced by the player. Command responses now show an acknowledgment, the system operating and a typed result. Longer transitions give each choice time to register, with Skip Animation available. Continue lets the player finish reading before moving on.</p>
    <p>A particle warning, shown as a simple diagram, gives the danger a visible form. Full-screen mission reports explain the outcome using the player’s decisions. These changes were design responses to the initial feedback. Further child playtesting is still needed to find out whether they help players understand the choices.</p>` },
  { id: 'science', title: 'A NASA record sets the warning', body: `
    <p>A real NASA archive observation helps decide when the player must shelter. Solar energetic particles (SEP) are high-energy particles from the Sun. They can pose <a href="https://www.nasa.gov/hrp/hazard-space-radiation/">radiation risks for space missions</a>.</p>
    <p>The game uses an archived observation from NASA’s DONKI space-weather database. It also uses a supplied start time for a solar flare, a burst of light and energy from the Sun. These times are mapped into a fictional mission clock. The result places the warning before shift 3, when the player must choose Shelter.</p>
    <p>The timestamp therefore affects a required action. A player needs to respond at the right time, as well as save enough energy. This is a simplified educational model, not a real lunar radiation forecast.</p>` },
  { id: 'validation', title: 'What the checks establish', body: `
    <p>The simulation passed all 11 automated tests. It checks full and partial success, missed shelter, power failure, Retry, battery accounting and warning timing. It also checks boundaries where a command cannot proceed.</p>
    <p>Those tests help preserve the rules as the interface changes. They verify software behaviour. They do not prove that the model matches a real habitat or that children learn from playing.</p>
    <details><summary>Test evidence and browser-check status (includes a solution)</summary><p>Run <code>node --test game.test.mjs</code>. The winning test path is Conserve, Conserve, Shelter, Greenhouse, Greenhouse, Conserve. It ends with a safe crew, 2/2 light periods and 2 kWh remaining.</p><p>Other tests cover exact energy boundaries, actions after the mission ends, rejected commands spending nothing and earlier shelter failing to protect shift 3. Every possible six-command sequence is traversed to check that the battery stays nonnegative and the input state stays unchanged. The warning is checked before the shift-3 choice, including its UI rendering order.</p><p>Historical development browser checks covered layouts at 1440, 390 and 320 pixels, command locking, Skip Animation, manual advancement, Retry cancellation, reduced motion, particle warnings and outcome reports. These are earlier checks, not certification of the public version.</p><p class="story-browser-status">Final release browser checks remain open. See <a href="./RELEASE_REPORT.md">the release report and checklist</a>. Initial feedback from children is recorded separately from software testing; no measured learning gains or controlled usability study are documented.</p></details>` },
  { id: 'difference', title: 'A short mission worth discussing', body: `
    <p>Moonbase Blackout is intended for children ages 7–12, especially in STEM learning settings. The learning goals are to compare competing needs, manage limited resources, plan ahead and notice when timing matters.</p>
    <p>A teacher or program leader could ask a player to explain a choice, then compare it with the mission report. A safe crew with too little greenhouse light gives a different result from full success. Players can try again and see how a revised plan changes the outcome.</p>
    <p>The game combines a real archived timestamp with a small resource puzzle and visible system feedback. The model is small enough to reason through, while its multiple outcomes give players something to investigate.</p>
    <p>Early design inspiration included <a href="https://slowroads.io/">slowroads.io</a> for focused, immersive presentation. The design later moved toward physical control panels and green terminals. These were references for appearance and interaction; no artwork or code was copied from them.</p>` },
  { id: 'next', title: 'What to carry into the next version', body: `
    <p>The prototype’s feedback showed that correct code does not guarantee a good learning experience. Listening to players changed the priorities. Keeping the scope small made those revisions easier to test.</p>
    <p>The NASA record also showed how a real observation can shape a game without becoming a real prediction. Its role has a clear boundary: it helps set the warning time.</p>
    <p>The next step is more child playtesting: can players explain an energy cost, spot the shelter warning and understand their result? Possible later work includes additional NASA-derived events and accessibility or teaching refinements. These are future ideas, not features in the current mission.</p>` },
  { id: 'credits', title: 'People, tools and project information', body: `
    <p>Luqman is Project Lead, responsible for research, game design, UI/UX direction, feedback collection, testing and iteration. Farhan, his father, is Advisor and Code Reviewer, with a supporting role in technical advice and checking code.</p>
    <h4 id="story-tools">Tools and AI assistance</h4>
    <p>ChatGPT helped with brainstorming, research assistance, planning, prompts and review. Codex generated the initial implementation, tests and documentation, and made substantial later code, styling, testing and debugging contributions, including this story revision. AI was part of implementation, not only editing.</p>
    <p>Luqman chose the problem, learning goals and model limits, directed the interface and story, reviewed results and set revision priorities. These contributions do not mean he independently hand-coded every component.</p>
    <p>The project uses plain HTML, CSS and JavaScript ES modules, with no framework, backend, dependencies or build step. Rules live in <code>game.mjs</code>; rendering and input live in <code>app.mjs</code>. Tools include VS Code, Git, GitHub and Node.js. The game is hosted on GitHub Pages.</p>
    <h4>Sources and artwork</h4>
    <p>NASA CCMC DONKI supplied the archived SEP data and linked-event information. NASA Space Apps supplied the challenge. The exterior uses original inline SVG artwork; the interface uses CSS and system fonts. The game has visual warnings and no audio.</p>
    <h4 id="story-privacy">Privacy &amp; Use</h4>
    <p>No account or personal information is required. The project team does not collect gameplay choices or results. The game has no analytics, advertising, forms, cookies or embedded services. Progress stays in browser memory and resets on reload; preferences and progress are not saved in local storage.</p>
    <p>Code and mission data load from the same website. External links lead to sites with their own privacy practices. GitHub Pages logs visitor IP addresses for security, as explained in its <a href="https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection">hosting documentation</a> and <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">privacy statement</a>.</p>
    <h4 id="story-license">License and independent status</h4>
    <p>Original code, documentation and artwork are offered under <a href="./LICENSE">Apache License 2.0</a>. <a href="./NOTICE">NOTICE</a> records project attribution and AI assistance. <a href="./ASSET_CREDITS.md">Asset Credits</a> identifies sources and third-party rights. NASA records retain their separate terms; the project does not relicense them.</p>
    <p>This is an independent educational project. NASA does not endorse it. It is not an official NASA product or a tool for real mission safety decisions.</p>` },
];
