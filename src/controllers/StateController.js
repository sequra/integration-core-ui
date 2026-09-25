if (!window.SequraFE) {
    window.SequraFE = {};
}

// Define the supported configuration capabilities.
SequraFE.flags = {
    isStoreSwitcherVisible: true,
    ...(SequraFE.flags || {})
};

SequraFE.appStates = {
    ONBOARDING: 'onboarding',
    SETTINGS: 'settings'
};

SequraFE.appPages = {
    ONBOARDING: {
        CONNECT: 'connect',
        DEPLOYMENTS: 'deployments'
    },
    SETTINGS: {
        CONNECTION: 'connection'
    }
};

(function () {
    /**
     * @typedef Store
     * @property {string} storeId
     * @property {string} storeName
     */

    /**
     * @typedef StateConfiguration
     * @property {string} stateUrl
     * @property {string} storesUrl
     * @property {string} currentStoreUrl
     * @property {string} getConnectionDataUrl
     * @property {string} versionUrl
     * @property {Record<string, any>} pageConfiguration
     * @property {string} [getDeploymentsUrl]
     */

    /**
     * @typedef Version
     * @property {string} current
     * @property {string | null} new
     * @property {string | null} downloadNewVersionUrl
     */

    /**
     * @typedef DataStore
     * @property {Version | null} version
     * @property {Store[] | null} stores
     * @property {ConnectionSettings | null} connectionSettings
     * @property {DeploymentSettings[] | null} deploymentsSettings
     * @property {DeploymentSettings[] | null} notConnectedDeployments
     */

    /**
     * @typedef {Object} DeploymentSettings
     * @property {string} id
     * @property {string} name
     * @property {boolean} [active]
     */

    /**
     * Main controller of the application.
     *
     * @param {StateConfiguration} configuration
     *
     * @constructor
     */
    function StateController(configuration) {
        /** @type AjaxServiceType */
        const api = SequraFE.ajaxService;
        const { pageControllerFactory, templateService, utilities } = SequraFE;

        let currentState = '';
        let previousState = '';

        /**
         * @type {DataStore}
         */
        let dataStore;

        const clearDataStore = () => {
            dataStore = {
                version: null,
                stores: null,
                connectionSettings: null,
                notConnectedDeployments: null,
                deploymentsSettings: null
            };
        }

        clearDataStore();

        /**
         * Main entry point for the application.
         * Determines the current state and runs the start controller.
         */
        this.display = () => {
            utilities.showLoader();
            clearDataStore();
            templateService.clearMainPage();

            window.addEventListener('hashchange', updateStateOnHashChange, false);

            api.get(!this.getStoreId() ? configuration.currentStoreUrl : configuration.storesUrl.sqReplaceUrlPlaceholder('{storeId}', this.getStoreId()), () => null, SequraFE.customHeader)
                .then(
                    /** @param {Store|Store[]} response */
                    (response) => {
                        const loadStore = (store) => {
                            this.setStoreId(store.storeId);

                            return displayPageBasedOnState();
                        };

                        let store = !Array.isArray(response) ?
                            response :
                            response.find((s) => s.storeId === this.getStoreId());

                        if (!store) {
                            // the active store is probably deleted, we need to switch to the default store
                            return api.get(configuration.currentStoreUrl, null, SequraFE.customHeader).then(loadStore);
                        }

                        return loadStore(store);
                    }
                )
        };

        /**
         * Updates the application state on a hash change.
         */
        const updateStateOnHashChange = () => {
            const state = window.location.hash.substring(1);
            state && this.goToState(state);
        };

        /**
         * Onboarding pages the store offers, in the order they are walked through.
         *
         * @returns {string[]}
         */
        const onboardingPages = () => SequraFE.pages?.onboarding ?? [];

        /**
         * Tells whether the configuration an onboarding page asks for is already there.
         *
         * @param {string} page
         * @returns {boolean}
         */
        const isOnboardingPageComplete = (page) => {
            switch (page) {
                case SequraFE.appPages.ONBOARDING.DEPLOYMENTS:
                    // `active` is the selection the deployments form keeps for the current
                    // page session; a connected deployment settles the step across reloads,
                    // because the API reports deployments without a selection.
                    return Boolean(dataStore.deploymentsSettings?.some((deployment) => deployment.active === true))
                        || Boolean(dataStore.connectionSettings?.connectionData?.length);
                case SequraFE.appPages.ONBOARDING.CONNECT:
                    return Boolean(dataStore.connectionSettings?.connectionData?.length)
                        && dataStore.connectionSettings.connectionData.every((c) => c.username && c.password);
                default:
                    return true;
            }
        };

        /**
         * Returns the first onboarding page of the store that is not done yet.
         *
         * @returns {string | undefined}
         */
        const pendingOnboardingPage = () => onboardingPages().find((page) => !isOnboardingPageComplete(page));

        /**
         * Requests one of the URLs the store configured the application with,
         * resolving to null for a page the store does not offer.
         *
         * @param {string | undefined | null} url
         * @returns {Promise<any>}
         */
        const getConfigured = (url) => url
            ? api.get(url.sqReplaceUrlPlaceholder('{storeId}', this.getStoreId()), null, SequraFE.customHeader)
            : Promise.resolve(null);

        /**
         * Opens the page the state of the integration asks for, after loading the data
         * every page needs.
         *
         * @returns {Promise<void>}
         */
        const displayPageBasedOnState = () => {
            utilities.showLoader();

            const onboardingConfiguration = configuration.pageConfiguration.onboarding;

            return Promise.all([
                getConfigured(configuration.versionUrl),
                getConfigured(configuration.storesUrl),
                getConfigured(onboardingConfiguration.getConnectionDataUrl),
                getConfigured(onboardingConfiguration.getDeploymentsUrl),
            ]).then(([versionRes, storesRes, connectionSettingsRes, deploymentsSettingsRes]) => {
                dataStore.version = versionRes;
                dataStore.stores = storesRes;
                dataStore.connectionSettings = connectionSettingsRes;
                dataStore.deploymentsSettings = deploymentsSettingsRes;

                return api.get(configuration.stateUrl.sqReplaceUrlPlaceholder('{storeId}', this.getStoreId()), null, SequraFE.customHeader);
            }).then((stateRes) => {
                if (SequraFE.state.getCredentialsChanged()) {
                    SequraFE.state.removeCredentialsChanged();
                }

                routeToState(stateRes);
            }).catch(() => {
            });
        };

        /**
         * Opens the page the state of the integration asks for.
         *
         * @param {{state: string}} stateRes
         *
         * @returns {void}
         */
        const routeToState = (stateRes) => {
            const page = this.getPage();

            if (stateRes.state === SequraFE.appStates.ONBOARDING) {
                this.goToState(SequraFE.appStates.ONBOARDING + '-' + page, null, true);

                return;
            }

            if (!page) {
                this.goToState(SequraFE.appStates.SETTINGS, null, true)

                return;
            }

            this.goToState(SequraFE.appStates.SETTINGS + '-' + page, null, true);
        };

        /**
         * Navigates to a state.
         *
         * @param {string} state
         * @param {Record<string, any> | null?} additionalConfig
         * @param {boolean} [force=false]
         */
        this.goToState = (state, additionalConfig = null, force = false) => {
            if ((currentState === state && !force)) {
                return;
            }

            utilities.showLoader();
            let [controllerName, page] = state.split('-');

            // Only the onboarding pages the store offers are walked through, in their order,
            // and a page is shown once every page before it is done.
            const pendingPage = pendingOnboardingPage();

            if (controllerName === SequraFE.appStates.ONBOARDING) {
                const mustReconnect = SequraFE.state.getCredentialsChanged();

                if (!pendingPage && !mustReconnect) {
                    // Onboarding is done: back to the page the merchant was on, or to the
                    // first page of the configured application when there was none.
                    const isLeavingOnboarding = !currentState
                        || currentState.split('-')[0] === SequraFE.appStates.ONBOARDING;

                    this.goToState(
                        isLeavingOnboarding ? SequraFE.appStates.SETTINGS : currentState,
                        null,
                        true
                    );

                    return;
                }

                const resumePage = pendingPage ?? SequraFE.appPages.ONBOARDING.CONNECT;
                const requestedIndex = onboardingPages().indexOf(page);
                if (requestedIndex === -1 || requestedIndex > onboardingPages().indexOf(resumePage)) {
                    page = resumePage;
                }

                if (page === SequraFE.appPages.ONBOARDING.CONNECT) {
                    SequraFE.state.removeCredentialsChanged();
                }

                displayPage(controllerName + '-' + page, additionalConfig);

                return;
            }

            if (
                SequraFE.state.getCredentialsChanged()
                && onboardingPages().includes(SequraFE.appPages.ONBOARDING.CONNECT)
            ) {
                this.goToState(SequraFE.appStates.ONBOARDING + '-' + SequraFE.appPages.ONBOARDING.CONNECT, additionalConfig, true);

                return;
            }

            if (pendingPage) {
                this.goToState(SequraFE.appStates.ONBOARDING + '-' + pendingPage, additionalConfig, true);

                return;
            }

            displayPage(state, additionalConfig);
        };

        const displayPage = (state, additionalConfig = null) => {
            let [controllerName, page] = state.split('-');
            if (!Object.values(SequraFE.appStates).includes(controllerName)) {
                // A state the application does not know, such as a bookmark of a page that
                // is gone: start over and let the restart pick the page.
                SequraFE.state.display();

                return;
            }

            if (!page || !SequraFE.pages[controllerName]?.includes(page)) {
                page = SequraFE.pages[controllerName]?.[0];
                state = page ? controllerName + '-' + page : controllerName;
            }

            const config = { storeId: this.getStoreId(), ...(additionalConfig || {}) };
            const controller = pageControllerFactory.getInstance(
                controllerName,
                getControllerConfiguration(controllerName, page)
            );

            previousState = currentState;
            currentState = state;
            setPage(page);

            window.location.hash = state;
            controller && controller.display(config);
        }

        /**
         * Gets controller configuration.
         *
         * @param {string} controllerName
         * @param {string?} page
         *
         * @return {Record<string, any>}
         */
        const getControllerConfiguration = (controllerName, page) => {
            let config = utilities.cloneObject(configuration.pageConfiguration[controllerName] || {});
            Object.keys(config).forEach((key) => {
                config[key] = config[key].sqReplaceUrlPlaceholder('{storeId}', this.getStoreId());
            });
            page && (config.page = page);

            return config;
        };

        /**
         * Sets the application page to local storage.
         *
         * @param {string} page
         */
        const setPage = (page) => {
            localStorage.setItem('sq-page', page);
        }

        /**
         * Gets the application page from local storage.
         *
         * @returns {string}
         */
        this.getPage = () => {
            if (window.location.hash) {
                let page = window.location.hash.substring(1);
                if (page) {
                    page = page.split('-')[1];
                    if (page) {
                        setPage(page);
                        return page;
                    }
                }
            }

            return localStorage.getItem('sq-page');
        }

        /**
         * Sets the credentials changed flag to local storage.
         */
        this.setCredentialsChanged = () => {
            localStorage.setItem('sq-password-changed', '1');
        }

        /**
         * Removes the credentials changed flag from local storage.
         *
         * @returns {string}
         */
        this.removeCredentialsChanged = () => {
            localStorage.removeItem('sq-password-changed');
        }

        /**
         * Gets the credentials changed flag from local storage.
         *
         * @returns {string}
         */
        this.getCredentialsChanged = () => {
            return localStorage.getItem('sq-password-changed');
        }

        /**
         * Sets the store ID to local storage.
         *
         * @param {string} storeId
         */
        this.setStoreId = (storeId) => {
            sessionStorage.setItem('sq-active-store-id', storeId);
        };

        /**
         * Gets the store ID from local storage.
         *
         * @returns {string}
         */
        this.getStoreId = () => {
            return sessionStorage.getItem('sq-active-store-id');
        };

        this.getData = (key) => {
            if (!Object.keys(dataStore).includes(key)) {
                return null;
            }

            return dataStore[key];
        }

        this.setData = (key, value) => {
            if (Object.keys(dataStore).includes(key)) {
                dataStore[key] = value;
            }
        }
    }

    SequraFE.StateController = StateController;
})();
