if (!window.SequraFE) {
    window.SequraFE = {};
}

// Define the supported configuration capabilities.
SequraFE.flags = {
    isShowCheckoutAsHostedPageFieldVisible: true,
    configurableSelectorsForMiniWidgets: false,
    isServiceSellingAllowed: false,
    isAltPriceSelectorVisible: false,
    isStoreSwitcherVisible: true,
    ...(SequraFE.flags || {})
};

SequraFE.appStates = {
    ONBOARDING: 'onboarding',
    SETTINGS: 'settings',
    PAYMENT: 'payment',
    ADVANCED: 'advanced'
};

SequraFE.appPages = {
    ONBOARDING: {
        CONNECT: 'connect',
        DEPLOYMENTS: 'deployments',
        COUNTRIES: 'countries',
        WIDGETS: 'widgets'
    },
    SETTINGS: {
        GENERAL: 'general',
        CONNECTION: 'connection',
        ORDER_STATUS: 'order_status',
        WIDGET: 'widget'
    },
    PAYMENT: {
        METHODS: 'methods'
    },
    ADVANCED: {
        DEBUG: 'debug'
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
     * @property {string} shopNameUrl
     * @property {Record<string, any>} pageConfiguration
     * @property {string} [getDeploymentsUrl]
     * @property {string} [sellingCountriesConfiguredUrl] Endpoint telling whether the selling
     * countries have been configured. Set it when the countries are configured outside of the
     * store, in the SeQura portal.
     */

    /**
     * @typedef Version
     * @property {string} current
     * @property {string | null} new
     * @property {string | null} downloadNewVersionUrl
     */

    /**
     * @typedef ShopName
     * @property {string} shopName
     */

    /**
     * @typedef DataStore
     * @property {Version | null} version
     * @property {Store[] | null} stores
     * @property {ConnectionSettings | null} connectionSettings
     * @property {CountrySettings | null} countrySettings
     * @property {GeneralSettings | null} generalSettings
     * @property {WidgetSettings | null} widgetSettings
     * @property {PaymentMethod[] | null} paymentMethods
     * @property {object | null} allAvailablePaymentMethods
     * @property {SellingCountry[] | null} sellingCountries
     * @property {DeploymentSettings[] | null} deploymentsSettings
     * @property {DeploymentSettings[] | null} notConnectedDeployments
     * @property {LogsSettings | null} logsSettings
     * @property {Category[] | null} shopCategories
     */

    /**
     * @typedef {Object} DeploymentSettings
     * @property {string} id
     * @property {string} name
     * @property {boolean} [active]
     */

    /**
     * @typedef {Object} LogsSettings
     * @property {boolean} enabled
     * @property {int} level
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
         * How often the store is asked whether the selling countries have been configured in
         * the SeQura portal, in milliseconds.
         *
         * @type {number}
         */
        const SELLING_COUNTRIES_POLL_INTERVAL = 5000;

        /**
         * Handle of the interval that watches for that configuration.
         *
         * @type {number | null}
         */
        let sellingCountriesWatcher = null;

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
                deploymentsSettings: null,
                countrySettings: null,
                generalSettings: null,
                widgetSettings: null,
                paymentMethods: null,
                allAvailablePaymentMethods: null,
                sellingCountries: null,
                shopCategories: null,
                logsSettings: null
            };
        }

        clearDataStore();

        /**
         * Main entry point for the application.
         * Determines the current state and runs the start controller.
         */
        this.display = () => {
            utilities.showLoader();
            stopWatchingSellingCountries();
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
         * Stops watching for the selling countries configuration.
         *
         * @returns {void}
         */
        const stopWatchingSellingCountries = () => {
            if (sellingCountriesWatcher !== null) {
                clearInterval(sellingCountriesWatcher);
                sellingCountriesWatcher = null;
            }
        };

        /**
         * Asks the store whether the selling countries have been configured, resolving to
         * null when the store could not answer: an unreachable check must not be read as
         * a configuration that is missing.
         *
         * @returns {Promise<boolean | null>}
         */
        const fetchSellingCountriesConfigured = () => getConfigured(configuration.sellingCountriesConfiguredUrl)
            .then((response) => (response && typeof response.configured === 'boolean' ? response.configured : null))
            .catch(() => null);

        /**
         * Shows that the integration is waiting for the merchant to enable the selling
         * countries in the SeQura portal, and keeps checking until they have. The page offers
         * the portal itself and a manual refresh so the merchant never has to wait for a
         * check to come around.
         *
         * @returns {void}
         */
        const displayPendingSellingCountriesPage = () => {
            const generator = SequraFE.elementGenerator;
            const portalUrl = dataStore.connectionSettings?.portalUrl;
            const settingsPage = (SequraFE.pages?.settings ?? []).includes(SequraFE.appPages.SETTINGS.CONNECTION) ?
                SequraFE.appPages.SETTINGS.CONNECTION :
                (SequraFE.pages?.settings ?? [])[0];

            currentState = '';
            templateService.clearMainPage();
            templateService.getMainPage().append(
                generator.createElement('div', 'sq-page-content-wrapper sqv--settings', '', null, [
                    generator.createElement('div', 'sq-page-content', '', null, [
                        generator.createElement('div', 'sq-content-row', '', null, [
                            generator.createElement('main', 'sq-content', '', null, [
                                generator.createElement('div', 'sq-content-inner', '', null, [
                                    generator.createFlashMessage('countries.pending.warning', 'warning'),
                                    generator.createPageHeading({
                                        title: 'countries.pending.title',
                                        text: 'countries.pending.description'
                                    }),
                                    generator.createLoader({ type: 'large' })
                                ]),
                                generator.createElement('div', 'sq-page-footer', '', null, [
                                    generator.createElement('div', 'sqp-actions', '', null, [
                                        // Waiting for the portal must not lock the merchant
                                        // out of the connection itself.
                                        settingsPage ? generator.createButton({
                                            type: 'cancel',
                                            size: 'medium',
                                            label: 'sidebar.connectionSettings',
                                            onClick: () => this.goToState(
                                                SequraFE.appStates.SETTINGS + '-' + settingsPage
                                            )
                                        }) : [],
                                        generator.createButton({
                                            type: 'cancel',
                                            size: 'medium',
                                            label: 'countries.pending.refresh',
                                            onClick: () => this.display()
                                        }),
                                        portalUrl ? generator.createButton({
                                            type: 'primary',
                                            size: 'medium',
                                            label: 'countries.pending.openPortal',
                                            onClick: () => window.open(portalUrl, '_blank')
                                        }) : []
                                    ])
                                ])
                            ])
                        ])
                    ])
                ])
            );

            utilities.hideLoader();

            stopWatchingSellingCountries();
            sellingCountriesWatcher = setInterval(() => {
                fetchSellingCountriesConfigured().then((configured) => {
                    configured !== false && this.display();
                });
            }, SELLING_COUNTRIES_POLL_INTERVAL);
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
                    return Boolean(dataStore.connectionSettings?.connectionData?.every((c) => c.username && c.password));
                case SequraFE.appPages.ONBOARDING.COUNTRIES:
                    return Boolean(dataStore.countrySettings?.length) && !SequraFE.state.getCredentialsChanged();
                case SequraFE.appPages.ONBOARDING.WIDGETS:
                    return dataStore.widgetSettings?.widgetStyles !== undefined
                        && Boolean(
                            dataStore.widgetSettings?.displayWidgetOnProductPage
                            || dataStore.widgetSettings?.showInstallmentAmountInCartPage
                            || dataStore.widgetSettings?.showInstallmentAmountInProductListing
                        );
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
         * Tells whether the selling countries are configured in the SeQura portal instead of
         * in the store: the store then offers no countries page and names the endpoint that
         * reports the state of that configuration.
         *
         * @returns {boolean}
         */
        const areSellingCountriesConfiguredInPortal = () => Boolean(configuration.sellingCountriesConfiguredUrl)
            && !onboardingPages().includes(SequraFE.appPages.ONBOARDING.COUNTRIES);

        this.areSellingCountriesConfiguredInPortal = areSellingCountriesConfiguredInPortal;

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
            const advancedConfiguration = configuration.pageConfiguration.advanced;

            return Promise.all([
                getConfigured(configuration.versionUrl),
                getConfigured(configuration.storesUrl),
                getConfigured(onboardingConfiguration.getConnectionDataUrl),
                getConfigured(onboardingConfiguration.getCountrySettingsUrl),
                getConfigured(onboardingConfiguration.getWidgetSettingsUrl),
                getConfigured(onboardingConfiguration.getDeploymentsUrl),
                getConfigured(advancedConfiguration && advancedConfiguration.getLogsSettingsUrl),
            ]).then(([versionRes, storesRes, connectionSettingsRes, countrySettingsRes, widgetSettingsRes, deploymentsSettingsRes, logsSettingsRes]) => {
                dataStore.version = versionRes;
                dataStore.stores = storesRes;
                dataStore.connectionSettings = connectionSettingsRes;
                dataStore.countrySettings = countrySettingsRes;
                dataStore.widgetSettings = widgetSettingsRes;
                dataStore.deploymentsSettings = deploymentsSettingsRes;
                dataStore.logsSettings = logsSettingsRes;

                return Promise.all([
                    api.get(configuration.stateUrl.sqReplaceUrlPlaceholder('{storeId}', this.getStoreId()), null, SequraFE.customHeader),
                    areSellingCountriesConfiguredInPortal() ? fetchSellingCountriesConfigured() : Promise.resolve(null)
                ]);
            }).then(([stateRes, sellingCountriesConfigured]) => {
                if (SequraFE.state.getCredentialsChanged()) {
                    SequraFE.state.removeCredentialsChanged();
                }

                if (sellingCountriesConfigured === false && isOnboardingPageComplete(SequraFE.appPages.ONBOARDING.CONNECT)) {
                    displayPendingSellingCountriesPage();

                    return;
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

            if (SequraFE.pages?.advanced?.includes(page)) {
                this.goToState(SequraFE.appStates.ADVANCED + '-' + page, null, true)

                return;
            }

            if (!page || SequraFE.pages.payment?.includes(page)) {
                this.goToState(SequraFE.appStates.PAYMENT + '-' + SequraFE.appPages.PAYMENT.METHODS, null, true)

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
                if (!pendingPage) {
                    // Onboarding is done: back to the page the merchant was on, or to the
                    // first page of the configured application when there was none.
                    const isLeavingOnboarding = !currentState
                        || currentState.split('-')[0] === SequraFE.appStates.ONBOARDING;

                    this.goToState(
                        isLeavingOnboarding ?
                            SequraFE.appStates.PAYMENT + '-' + SequraFE.appPages.PAYMENT.METHODS :
                            currentState,
                        null,
                        true
                    );

                    return;
                }

                const requestedIndex = onboardingPages().indexOf(page);
                if (requestedIndex === -1 || requestedIndex > onboardingPages().indexOf(pendingPage)) {
                    page = pendingPage;
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
            stopWatchingSellingCountries();

            let [controllerName, page] = state.split('-');
            if (!Object.values(SequraFE.appStates).includes(controllerName)) {
                SequraFE.state.display();
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
            SequraFE.state.setData('paymentMethods', null);
            SequraFE.state.setData('allAvailablePaymentMethods', null);
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

        /**
         * Returns a getVersion promise.
         *
         * @returns {Promise<ShopName>}
         */
        this.getShopName = () => {
            return api.get(configuration.shopNameUrl.sqReplaceUrlPlaceholder('{storeId}', this.getStoreId()), null, SequraFE.customHeader);
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
