# integration-core-ui
Repository to store the common assets files that integration-core may require

# UI Build Instructions

To generate the appropriate UI files, run the following commands:

## 1. Install dependencies

```bash
npm install
```

## 2. Build distribution files

```bash
npm run dist
```

This will generate all necessary UI resources in the ```dist``` directory.

## 3. Content of the ```dist/resources``` directory
The ```dist/resources``` directory contains:
- assets/fonts files
- css/sequra-core.css file
- js files
- lang files

## 4. Rebuilding After Changes

The contents of the `dist` directory are automatically regenerated and committed to the repository on every push to any branch. This is handled by a GitHub Actions workflow, which runs `npm run dist` and commits any changes to `dist` back to the remote repository. You do not need to manually build or commit the `dist` directory when pushing changes; this process is fully automated.

That said, if you want to manually trigger a rebuild of the `dist` directory after every change to the UI source files, the next command should be run:

```bash
npm run dist
```

to regenerate the output files.

## 5. Distributing UI Resources

Once the UI resources are generated in the ```dist``` directory, the new code should be pushed.

In every SeQura integration, should be added a development dependency to the ```sequra-core-admin-fe``` package:

```"sequra-core-admin-fe": "github:sequra/integration-core-ui"```

After adding the dependency, install or update the project's packages using the appropriate package manager (npm) to ensure that ```sequra-core-admin-fe``` is installed.
The package will be placed in the ```node_modules``` directory.

Each SeQura integration includes specific instructions in its README file that should be followed to correctly import and place the CORE UI resources.


# ``SequraFE.flags``

The ``SequraFE.flags`` object defines several configuration options that control how the integration behaves across different configurations, environments, and contexts.

```js
SequraFE.flags = {
    isShowCheckoutAsHostedPageFieldVisible: true,
    configurableSelectorsForMiniWidgets: false,
    isServiceSellingAllowed: false,
    isPaymentApp: true,
    ...(SequraFE.flags || {})
};
```

These flags can be overridden in the integration that imports ``sequra-core-admin-fe`` library.

## `isPaymentApp` ##

This flag indicates whether the integration is running as a **payment app** or as a **marketing app**.  
It determines which integration page is displayed after the onboarding process is completed.

**Type:** `boolean`  
**Default:** `true`

**Purpose:**
- `true`: The integration behaves as a **payment app** and displays the **payment methods page** after onboarding.
- `false`: The integration behaves as a **marketing app** and displays the **widget configuration page** after onboarding.

