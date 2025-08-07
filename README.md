# integration-core-ui
Repository to store the common assets files that integration-core may require

# UI Build Instructions

To generate the appropriate UI files, run the following commands:

## 1. Install dependencies

```bash
yarn install
```

## 2. Build distribution files

```bash
yarn dist
```

This will generate all necessary UI resources in the ```dist``` directory.

## 3. Content of the ```dist/resources``` directory
The ```dist/resources``` directory contains:
- assets/fonts files
- css/sequra-core.css file
- js files
- lang files

## 4. Rebuilding After Changes

After every change to the UI source files, the next commant should be run:

```bash
yarn dist
```

to regenerate the output files.

## 5. Distributing UI Resources

Once the UI resources are generated in the ```dist``` directory and the new code is pushed, 
each SeQura integration contains instructions in its README file that should be followed in order to import the CORE UI resources.