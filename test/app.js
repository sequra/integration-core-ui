const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const port = 3800;

const translations = fs.readFileSync(path.join(__dirname, 'resources/lang/en.json'), 'utf8');

const getPage = (pageName) => {
    const pagePath = path.join(__dirname, pageName + '.html');
    if (!fs.existsSync(pagePath)) {
        return '<h1>404</h1>';
    }

    let template = fs.readFileSync(pagePath, 'utf8');

    template = template.replace("'%default_translations%'", translations);
    template = template.replace("'%current_lang_translations%'", translations);
    template = template.replace(
        '//#scripts#',
        [
            'ImagesProvider',
            'AjaxService',
            'TranslationService',
            'TemplateService',
            'UtilityService',
            'ValidationService',
            'ResponseService',
            'PageControllerFactory',
            'FormFactory',
            'StateUUIDService',
            'ElementGenerator',
            'ModalComponent',
            'DropdownComponent',
            'MultiItemSelectorComponent',
            'DataTableComponent',
            'PageHeaderComponent',
            'ConnectionSettingsForm',
            'CountryConfigurationForm',
            'WidgetSettingsForm',
            'GeneralSettingsForm',
            'OrderStatusMappingSettingsForm',
            'StateController',
            'OnboardingController',
            'PaymentController',
            'SettingsController'
        ]
            .map((script) => `<script src="/js/${script}.js"></script>`)
            .join('\n')
    );

    return template;
};

app.use(express.static(path.join(__dirname, 'resources')));

app.get('/*', (req, res) => {
    const pageName = req.url.substring(1) || 'index';
    res.send(getPage(pageName));
});

const privateKey = fs.readFileSync(path.join(__dirname, 'cert', 'server.key'), 'utf8');
const certificate = fs.readFileSync(path.join(__dirname, 'cert', 'server.cert'), 'utf8');

const httpsServer = https.createServer({ key: privateKey, cert: certificate }, app);

httpsServer.listen(port, 'localhost', () => {
    console.log(`Demo app listening on https://localhost:${port}/`);
});
