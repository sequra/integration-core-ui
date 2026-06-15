if (!window.SequraFE) {
    window.SequraFE = {};
}

(function () {
    /**
     * @typedef AffiliateSettings
     * @property {boolean} enabled
     * @property {string} offerId
     * @property {string} securityToken
     */

    /**
     * Handles affiliate settings form logic.
     *
     * @param {{ affiliateSettings: AffiliateSettings }} data
     * @param {{
     * getAffiliateSettingsUrl: string,
     * saveAffiliateSettingsUrl: string,
     * page: string,
     * appState: string,
     * }} configuration
     * @constructor
     */
    function AffiliateSettingsForm(data, configuration) {
        const {
            elementGenerator: generator,
            validationService: validator,
            translationService,
            utilities
        } = SequraFE;

        /** @type AjaxServiceType */
        const api = SequraFE.ajaxService;

        /** @type AffiliateSettings */
        const defaultFormData = {
            enabled: false,
            offerId: '',
            securityToken: ''
        };

        /** @type AffiliateSettings */
        let activeSettings;
        /** @type AffiliateSettings */
        let changedSettings;

        /**
         * Handles form rendering.
         */
        this.render = () => {
            if (!activeSettings) {
                activeSettings = utilities.cloneObject(defaultFormData);
                for (let key in activeSettings) {
                    activeSettings[key] = data?.affiliateSettings?.[key] ?? defaultFormData[key];
                }
            }

            changedSettings = utilities.cloneObject(activeSettings);
            initForm();
            utilities.disableFooter(true);
            utilities.hideLoader();
        }

        /**
         * Initializes the form structure.
         */
        const initForm = () => {
            const pageContent = document.querySelector('.sq-content');
            pageContent?.append(
                generator.createElement('div', 'sq-content-inner', '', null, [
                    generator.createElement('div', 'sqp-flash-message-wrapper'),
                    generator.createPageHeading({
                        title: 'affiliate.title',
                        text: 'affiliate.description'
                    }),
                    generator.createToggleField({
                        value: changedSettings.enabled,
                        label: 'affiliate.enable.label',
                        description: 'affiliate.enable.description',
                        onChange: (value) => handleChange('enabled', value)
                    }),
                    generator.createTextField({
                        className: 'sq-text-input',
                        name: 'offerId',
                        value: changedSettings.offerId,
                        label: 'affiliate.offerId.label',
                        description: 'affiliate.offerId.description',
                        placeholder: translationService.translate('affiliate.offerId.placeholder'),
                        onChange: (value) => handleChange('offerId', value)
                    }),
                    generator.createTextField({
                        className: 'sq-text-input',
                        name: 'securityToken',
                        value: changedSettings.securityToken,
                        label: 'affiliate.securityToken.label',
                        description: 'affiliate.securityToken.description',
                        placeholder: translationService.translate('affiliate.securityToken.placeholder'),
                        onChange: (value) => handleChange('securityToken', value)
                    })
                ])
            );

            document.querySelector('.sq-content')?.append(
                generator.createPageFooter({
                    onSave: handleSave,
                    onCancel: () => {
                        const pageContent = document.querySelector('.sq-content');
                        while (pageContent?.firstChild) {
                            pageContent?.removeChild(pageContent.firstChild);
                        }
                        this.render();
                    }
                })
            );
        }

        /**
         * Handles form input changes.
         *
         * @param {string} name
         * @param {any} value
         */
        const handleChange = (name, value) => {
            changedSettings[name] = value;
            utilities.disableFooter(false);
        }

        /**
         * Validates the form. Offer ID and Security Token are only required when enabled.
         *
         * @returns {boolean}
         */
        const isFormValid = () => {
            if (!changedSettings.enabled) {
                return true;
            }

            let valid = true;
            const offerIdField = document.querySelector('[name="offerId"]');
            const securityTokenField = document.querySelector('[name="securityToken"]');

            if (!validator.validateRequiredField(offerIdField, 'validation.requiredField')) {
                valid = false;
            } else if (!/^[0-9]{1,4}$/.test(changedSettings.offerId)) {
                validator.validateField(offerIdField, true, 'affiliate.offerId.invalidFormat');
                valid = false;
            }

            if (!validator.validateRequiredField(securityTokenField, 'validation.requiredField')) {
                valid = false;
            } else if (!/^[a-zA-Z0-9]+$/.test(changedSettings.securityToken)) {
                validator.validateField(securityTokenField, true, 'affiliate.securityToken.invalidFormat');
                valid = false;
            }

            return valid;
        }

        /**
         * Handles saving of the form.
         */
        const handleSave = () => {
            if (!isFormValid()) {
                return;
            }

            utilities.showLoader();
            api.post(configuration.saveAffiliateSettingsUrl, changedSettings, SequraFE.customHeader)
                .then(() => {
                    activeSettings = utilities.cloneObject(changedSettings);
                    utilities.disableFooter(true);
                })
                .finally(utilities.hideLoader);
        }
    }

    SequraFE.AffiliateSettingsForm = AffiliateSettingsForm;
})();
