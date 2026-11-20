# Interactive PCB

[![SonarCloud](https://sonarcloud.io/images/project_badges/sonarcloud-white.svg)](https://sonarcloud.io/summary/new_code?id=oceanofthelost_InteractivePCB)

[InteractivePCB](https://github.com/oceanofthelost/InteractivePCB) is a hard fork of [InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom) with a focus interactions with a PCB beyond a bill of materials. To that end, InteractivePCB lets one interaction with individual PCB layers, aid in PCB assembly by showing similar parts, and also provide an interactive BOM.

Currently InteractivePCB is designed to work with EagleCAD with minor support for FusionElectonics and can be displayed using the Chrome web browser.

**This fork adds Altium Designer:** open the output folder of an Altium OutJob in the page and assemble from it (see [Altium Designer](#altium-designer)).
## Table of Contents

1. [About the Project](#about-the-project)
1. [Project Status](#project-status)
1. [Getting Started](#getting-started)
	1. [Dependencies](#dependencies)
	1. [Building](#building)
	1. [Installation](#installation)
	1. [Usage](#usage)
		1. [Altium Designer](#altium-designer)
		1. [EagleCAD](#eaglecad)
	1. [Branch Conventions](#branch-conventions)
1. [Release Process](#release-process)
	1. [Creating A Release](#creating-a-release)
		1. [Bugfix Release](#bugfix-release)
		1. [Feature Release](#Feature-release)
	1. [Versioning](#versioning)
1. [How to Get Help](#how-to-get-help)
1. [Contributing](#contributing)
1. [License](#license)
1. [Authors](#authors)
1. [Acknowledgments](#acknowledgements)

## About the Project

[InteractivePCB](https://github.com/oceanofthelost/InteractivePCB) started as a hard fork of [InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom) with the goal of adding support for EagleCAD, my choice of electronic CAD software at the time. Later InetractivePCB was used as a platform to learn HTML, JavaScript, CSS, and how to write formal specifications for data format.

InteractivePCB current focus is on integrate additional tools to analyze PCB's and to support additional ElectronicCAD software.

**[Back to top](#table-of-contents)**

## Project Status

InteractivePCB is still under active development but developed as time permits to the lead developer with features and enhancements implemented on an as needed basis.

Version 2 is released and can be found under [Releases](https://github.com/oceanofthelost/InteractivePCB/releases/). A Version 3 is in development with plans to release the project in the near future.

Browser support for Interactive PCB is primary for Chrome. Small PCB's may work in Firefox, but an unknown bug Forces Firefox to hand. No testing has been performed on other browsers.

**[Back to top](#table-of-contents)**

## Getting Started

The following section outlines how to get started  using and developing InteractivePCB. Dependencies, building, and usage shall be covered. For those interested only in using InteractivePCB, you may skip directly to [Usage](#usage)

### Dependencies

Following is a list of software expected to be installed:

1. [nodejs](https://nodejs.org/en/)
1. [npm](https://www.npmjs.com/)
1. [make](https://www.gnu.org/software/make/)

### Getting the Source

This project is [hosted on GitHub](https://github.com/oceanofthelost/InteractivePCB) and can be cloned by issuing the following command from a terminal:

```bash
$ git clone git@github.com:oceanofthelost/InteractivePCB.git
```

### Building

Open a terminal and navigate to GUI folder and issue the following command to build:

```bash
$ make
````

Once issued, make will use npm to install project specific dependencies, then generate InteractivePCB.html and related.

### Installation

No installation is necessary, simply have all the following files all in a folder:
1. index.css
2. index.js
1. iPCB.html

### Usage


#### Altium Designer

Build the viewer once (`make` in `GUI`, or `make release` for a single file `GUI/Release/iPCB.html`), open
`iPCB.html` in Chrome, Chromium or Edge (tested in Chromium; Firefox untested) and click **Open Altium export folder** (or drop the folder on the
page). Select the folder the OutJob writes, the one holding `ODB/`, `BOM/`, `Pick Place/`, ... The files are read in
the browser; nothing is uploaded.

What is used from the folder:

| Output | Used for | Needed |
|---|---|---|
| ODB++ (extracted `odb/` folder, `.tgz` or `.zip`) | board outline, copper, silkscreen, paste, mask, drills, mechanical layers, every part with its pads and outline, part parameters | yes, for the board drawing |
| BOM (`.xlsx` or `.csv` with a `Designator` column) | part number, description, manufacturer, supplier, **Fitted / Not Fitted**; parts missing from the BOM (fiducials, test points, mounting holes) are drawn but not listed | recommended |
| Pick and place (`.csv` / `.txt`) | positions only, when there is no ODB++ (parts are drawn as boxes) | fallback |
| Test point report (`*TPs.csv`) | test point table (`Tp`): name and net, click to find it on the board | optional |

Assembling:

- The BOM is grouped by part number with a **Placed** column. Click a row (or use the arrow keys) to highlight its
  parts on both sides; click a part on the board to find its row and see its description above the board.
- **Space** ticks *Placed* for the highlighted row and moves on to the next one. Placed parts are drawn green;
  *Hide placed parts* in the menu leaves only what is still to do.
- Ticks, layer visibility and settings are kept in the browser per board (project name, revision, variant).
- Layers can be switched per side in the layer table (`L`); copper of the other side, paste, mask and mechanical
  layers start hidden.

The same import runs from the command line, to hand someone one file with viewer and board together:

```bash
$ cd GUI && make release
$ node tools/altium2ipcb.js "<OutJob output folder>" --html board.html   # one self-contained page
$ node tools/altium2ipcb.js "<OutJob output folder>" -o pcbdata.json     # data for iPCB.html next to it
```

Notes:

- Positions come from ODB++. Altium writes bottom parts rotated and then mirrored although their mirror flag is
  `N`; every computed pad is checked against the pin records of the component file and a mismatch is reported in
  the import details.
- ODB++ from other tools also loads (tested with a Valor ODB++ of a 1700 part board), without the Altium BOM.
- A BOM saved as `.xls` (binary Excel) is not read; export `.xlsx` or `.csv`.
- `make test` runs the importer tests (node only).

#### EagleCAD

Start EagleCAD and from a PCB,  press ULP button and navigate to ipcb.ulp. Select a folder where to place script output, `pcbdata.json`. By default project directory is used.

Copy `pcbdata.json` to a folder created in [Installation](#installation).

Now open `iPCB.html` in a web browser.

**[Back to top](#table-of-contents)**


### Branch Conventions

Development consists of three primary branches:

1. **master**: Primary branch used for commuting all new development. Mastre branch will always consist of the latest software and may contain bugs and is not recommended for everyday use.
2. **Development_V2**: Bugfixes and requested minor features to be integrated into V2 are committed to **Development_V2** branch. Commits may be cherry picked from master ad added, or fixes may be ported to to master. When V3 is released **Development_V2** will be closed and replaced with **Development_V3**. Primary existence for **Developmen_\*** to provide an area to perform release candidate testing and bug fixes outside of master which may have breaking changes that are not ready for release.
3. **Release**: Public releases are merged from master and Development_\* branches directly into Release. After enough testing has been preformed on a release candidate it is deemed to be ready for release. All commits on release are tagged with a version number and also correspond to a working implementation of InteractivePCB.


Master branch is used like development branch. Reason master is not named develop is because initial development was by solo developer and solo developer did not care to over complicate development with multiple branches. Now that  project has grown this is being addressed and at some point in the future master will be renamed to develop to make it clear where primary development should occur.

## Release Process

### Creating A Release

Releases fall into one of two categorizes, bugfix and feature. The following section discuss the generic release steps common to both bugfix and feature releases.

Generic steps for creating a release are:

1. Set new version number in `version.js`
2. Open a terminal and navigate to the GUI folder.
3. Issue `make release`
4. Make a new commit on `Release` by pulling in master.
5. Tag new release with version number assigned in 1.
6. Push both `Release` branch and tags to origin.

The above will generate a zip file `iPCB.zip`.


Next, from GitHub:
1. Navigate to [releases](https://github.com/oceanofthelost/InteractivePCB/releases)
2. Select draft new release
3. Under `Choose a tag` select tag corresponding to newest version number
4. Under release notes, add a changelog of changes between new release and last release.
5. Add a section on how to download release, unzip and basic steps to use Interactive PCB.
6. Under "Attach binaries" Upload zip file generated in last step along with any ElectronicCAD plugins.


#### Bugfix Release

Bugfix releases are designed to address specific issues found in release software. Once an issue is identified and an issue ticket created on GitHub, development will commonsense on fixing the issue. Upon fixing the bug and adding the change to the software, testing will be preformed and when complete will a new release will be made, tagged, and released on [GitHub]([released](https://github.com/oceanofthelost/InteractivePCB/releases).


#### Feature Release

Feature releases used for adding new capabilities to InteractivePCB. First a feature request is made by creating a GitHuib issue. Next development on the feature will commence on a new branch and once complete will be merged back into master. When enough features are integrated or a milestone has been reached, then a release candidate will be created. Once a release candidate is made testing will commence to discover and fix any bugs. Once testing is complete a release will be made from the release candidate, tagged, and released on [GitHub]([released](https://github.com/oceanofthelost/InteractivePCB/releases).


### Versioning

InteractivePCB uses *Subjective Versioning* which is inspired by [Semantic Versioning](http://semver.org/). *Subjective Versioning* uses MAJOR.MINOR.PATCH-RC# with V prefixed. The following rules are used for incrementing MAJOR, MINOR, and PATCH:

1. MAJOR increment on breaking changes or at lead developers sole discretion. Upon incrementing MAJOR, MINOR and PATCH will be reset to 0.
2. MINOR increments on addition of new features not introducing breaking changes or large changes adding no new features or breaking changes. Incrementing minor will reset to zero PATCH.
3. PATCHincrements for bug fixes and small changes introducing no new features.
4. RC# is optional and is used for release candidates. For every fix # will increment.

## How to Get Help

Two methods exist for getting help related to InetractivePCB.

First and preferred way to request help is to post a questions on the [discussion board](https://github.com/oceanofthelost/InteractivePCB/discussions). If unable to ask a question on the discussion forum, you may also file an issue and adding the label `help` to the ticket.

In both cases of communication, do not worry, your request will be reviewed but a response may not or answered right away. Answer by the lead developer are made as time permits.

## Contributing

We encourage public contributions! Please review [CONTRIBUTING.md](CONTRIBUTING.md) for details on our development process and our [code of conduct](CODE_OF_CONDUCT.md) before you do!

**[Back to top](#table-of-contents)**

## License

??????????????

**[Back to top](#table-of-contents)**

## Authors

* **[Sean Alling](https://github.com/oceanofthelost/InteractivePCB)** - *Initial work*

Also see the list of [contributors](https://github.com/oceanofthelost/InteractivePCB/contributors) who participated in this project.

**[Back to top](#table-of-contents)**

## Acknowledgments

Thank you to the following for inspiration and assistance on this project.

[Embedded Artistry](https://github.com/embeddedartistry) for the thorough README template.

[Code Thessaurus](https://github.com/codethesaurus/codethesaur.us) for our code of conduct and issue and PR templates.

[openscopeproject](https://github.com/openscopeproject) for providing [InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom) for without, this project would not exist.

**[Back to top](#table-of-contents)**
