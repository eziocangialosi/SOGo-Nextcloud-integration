// ============================================================
// SOGo Nextcloud Integration
// ============================================================


(function () {

    'use strict';


    // ========================================================
    // Configuration
    // ========================================================

    var SOGO_ATTACH_VERSION =
        '2026-08-19-clean';

    /*
     * Set to true to enable detailed console output.
     */
    var SOGO_ATTACH_VERBOSE =
        false;

    var NEXTCLOUD_URL =
        'https://cloud.example.com';

    var NEXTCLOUD_AUTH_URL =
        NEXTCLOUD_URL +
        '/index.php/apps/sogo_attach/auth';

    var NEXTCLOUD_UPLOAD_URL =
        NEXTCLOUD_URL +
        '/index.php/apps/sogo_attach/upload';

    var NEXTCLOUD_FOLDERS_URL =
        NEXTCLOUD_URL +
        '/index.php/apps/sogo_attach/folders';

    var BUTTON_CLASS =
        'nc-sogo-attach-button';

    var nextcloudLoginPromise =
        null;


    // ========================================================
    // Logging helpers
    // ========================================================

    function log() {

        if (!SOGO_ATTACH_VERBOSE) {
            return;
        }

        var args =
            Array.prototype.slice.call(arguments);

        args.unshift('[SOGo Attach]');

        console.log.apply(
            console,
            args
        );
    }


    function warn() {

        if (!SOGO_ATTACH_VERBOSE) {
            return;
        }

        var args =
            Array.prototype.slice.call(arguments);

        args.unshift('[SOGo Attach]');

        console.warn.apply(
            console,
            args
        );
    }


    function error() {

        var args =
            Array.prototype.slice.call(arguments);

        args.unshift('[SOGo Attach]');

        console.error.apply(
            console,
            args
        );
    }


    // ========================================================
    // Utility functions
    // ========================================================

    function sleep(milliseconds) {

        return new Promise(
            function (resolve) {

                setTimeout(
                    resolve,
                    milliseconds
                );

            }
        );
    }


    async function parseJsonResponse(
        response,
        errorPrefix
    ) {

        var text =
            await response.text();

        try {
            return JSON.parse(text);

        } catch (exception) {

            throw new Error(
                errorPrefix +
                ': invalid JSON response.'
            );
        }
    }


    // ========================================================
    // Nextcloud session
    // ========================================================

    async function checkNextcloudSession() {

        var response;

        try {

            response =
                await fetch(
                    NEXTCLOUD_AUTH_URL +
                    '/status',
                    {
                        method: 'GET',
                        credentials: 'include',
                        headers: {
                            'Accept':
                                'application/json'
                        }
                    }
                );

        } catch (exception) {

            error(
                'Unable to check Nextcloud session.',
                exception
            );

            throw exception;
        }


        if (response.status === 401) {
            return {
                authenticated: false
            };
        }


        var data =
            await parseJsonResponse(
                response,
                'Nextcloud session check failed'
            );


        if (!response.ok) {

            throw new Error(
                data.error ||
                'Unable to check Nextcloud session.'
            );
        }


        return data;
    }


    // ========================================================
    // Login Flow v2
    // ========================================================

    async function startNextcloudLogin() {

        var response;

        try {

            response =
                await fetch(
                    NEXTCLOUD_AUTH_URL +
                    '/start',
                    {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'Accept':
                                'application/json'
                        }
                    }
                );

        } catch (exception) {

            error(
                'Unable to start Nextcloud Login Flow.',
                exception
            );

            throw exception;
        }


        var data =
            await parseJsonResponse(
                response,
                'Nextcloud Login Flow failed'
            );


        if (!response.ok) {

            throw new Error(
                data.error ||
                'Unable to start Nextcloud Login Flow.'
            );
        }


        if (data.authenticated) {
            return data;
        }


        if (
            !data.login ||
            !data.poll ||
            !data.poll.endpoint ||
            !data.poll.token
        ) {

            throw new Error(
                data.error ||
                'Invalid Login Flow response.'
            );
        }


        return data;
    }


    async function waitForNextcloudLogin(
        loginData
    ) {

        var popup =
            window.open(
                loginData.login,
                'sogo_attach_nextcloud_login',
                [
                    'width=1100',
                    'height=800',
                    'resizable=yes',
                    'scrollbars=yes'
                ].join(',')
            );


        if (!popup) {

            throw new Error(
                'The Nextcloud login window was blocked by the browser.'
            );
        }


        try {

            popup.focus();

        } catch (exception) {

            // Ignore focus errors.
        }


        var deadline =
            Date.now() + 300000;


        while (Date.now() < deadline) {

            await sleep(2000);


            var response;

            try {

                response =
                    await fetch(
                        loginData.poll.endpoint,
                        {
                            method: 'POST',
                            credentials: 'omit',
                            headers: {
                                'Content-Type':
                                    'application/x-www-form-urlencoded',
                                'Accept':
                                    'application/json'
                            },
                            body:
                                'token=' +
                                encodeURIComponent(
                                    loginData.poll.token
                                )
                        }
                    );

            } catch (exception) {

                warn(
                    'Login Flow polling request failed.',
                    exception
                );

                continue;
            }


            /*
             * HTTP 404 means that the Login Flow is still pending.
             */
            if (response.status === 404) {
                continue;
            }


            var pollData =
                await parseJsonResponse(
                    response,
                    'Nextcloud Login Flow polling failed'
                );


            if (!response.ok) {

                throw new Error(
                    pollData.error ||
                    'Nextcloud Login Flow polling failed.'
                );
            }


            if (
                pollData.loginName &&
                pollData.appPassword
            ) {

                try {

                    if (!popup.closed) {
                        popup.close();
                    }

                } catch (exception) {

                    // Ignore popup close errors.
                }


                /*
                 * Wait briefly for the browser session cookie.
                 */
                await sleep(1000);


                var session =
                    await checkNextcloudSession();


                for (
                    var retry = 0;
                    !session.authenticated &&
                    retry < 5;
                    retry++
                ) {

                    await sleep(1000);

                    session =
                        await checkNextcloudSession();
                }


                if (!session.authenticated) {

                    throw new Error(
                        'Nextcloud login completed, but no browser session was detected.'
                    );
                }


                return true;
            }
        }


        try {

            if (!popup.closed) {
                popup.close();
            }

        } catch (exception) {

            // Ignore popup close errors.
        }


        throw new Error(
            'Nextcloud login timed out.'
        );
    }


    async function ensureNextcloudLogin() {

        if (nextcloudLoginPromise) {

            log(
                'A Nextcloud login operation is already running.'
            );

            return nextcloudLoginPromise;
        }


        nextcloudLoginPromise =
            (async function () {

                var session =
                    await checkNextcloudSession();


                if (session.authenticated) {
                    return true;
                }


                var login =
                    await startNextcloudLogin();


                if (login.authenticated) {
                    return true;
                }


                await waitForNextcloudLogin(login);

                return true;

            })();


        try {

            return await nextcloudLoginPromise;

        } catch (exception) {

            nextcloudLoginPromise =
                null;

            throw exception;
        }
    }


    // ========================================================
    // Nextcloud CSRF token
    // ========================================================

    async function getNextcloudRequestToken() {

        var response =
            await fetch(
                NEXTCLOUD_URL +
                '/index.php/csrftoken',
                {
                    method: 'GET',
                    credentials: 'include'
                }
            );


        if (!response.ok) {

            throw new Error(
                'Unable to retrieve the Nextcloud CSRF token.'
            );
        }


        var data =
            await response.json();


        if (!data.token) {

            throw new Error(
                'Nextcloud CSRF token is missing.'
            );
        }


        return data.token;
    }


    // ========================================================
    // Nextcloud folders
    // ========================================================

    async function listNextcloudFolders(
        path
    ) {

        var token =
            await getNextcloudRequestToken();


        var response =
            await fetch(
                NEXTCLOUD_FOLDERS_URL +
                '?path=' +
                encodeURIComponent(path),
                {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept':
                            'application/json',
                        'requesttoken':
                            token
                    }
                }
            );


        var data =
            await parseJsonResponse(
                response,
                'Unable to read Nextcloud folders'
            );


        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.error ||
                'Unable to read Nextcloud folders.'
            );
        }


        return data;
    }


    // ========================================================
    // Folder picker
    // ========================================================

    async function chooseNextcloudFolder(
        originalFilename
    ) {

        var currentPath =
            '/';


        return new Promise(
            async function (resolve, reject) {

                var overlay =
                    document.createElement('div');

                overlay.style.position =
                    'fixed';

                overlay.style.inset =
                    '0';

                overlay.style.background =
                    'rgba(0, 0, 0, 0.45)';

                overlay.style.zIndex =
                    '999999';


                var dialog =
                    document.createElement('div');

                dialog.style.position =
                    'absolute';

                dialog.style.left =
                    '50%';

                dialog.style.top =
                    '50%';

                dialog.style.transform =
                    'translate(-50%, -50%)';

                dialog.style.width =
                    '600px';

                dialog.style.maxWidth =
                    '90vw';

                dialog.style.maxHeight =
                    '80vh';

                dialog.style.background =
                    '#fff';

                dialog.style.borderRadius =
                    '8px';

                dialog.style.boxShadow =
                    '0 10px 40px rgba(0, 0, 0, .35)';

                dialog.style.display =
                    'flex';

                dialog.style.flexDirection =
                    'column';


                // ------------------------------------------------
                // Header
                // ------------------------------------------------

                var header =
                    document.createElement('div');

                header.style.padding =
                    '16px';

                header.style.fontSize =
                    '18px';

                header.style.fontWeight =
                    '600';

                header.textContent =
                    'Save to Nextcloud';


                // ------------------------------------------------
                // Filename controls
                // ------------------------------------------------

                var filenameContainer =
                    document.createElement('div');

                filenameContainer.style.padding =
                    '12px 16px';

                filenameContainer.style.display =
                    'flex';

                filenameContainer.style.alignItems =
                    'center';

                filenameContainer.style.gap =
                    '8px';

                filenameContainer.style.borderTop =
                    '1px solid #ddd';


                var filenameLabel =
                    document.createElement('span');

                filenameLabel.textContent =
                    'Name:';


                var filenameInput =
                    document.createElement('input');

                filenameInput.type =
                    'text';

                filenameInput.value =
                    originalFilename ||
                    'attachment';

                filenameInput.style.flex =
                    '1';

                filenameInput.style.padding =
                    '7px 9px';

                filenameInput.style.border =
                    '1px solid #aaa';

                filenameInput.style.borderRadius =
                    '4px';


                var renameButton =
                    document.createElement('button');

                renameButton.type =
                    'button';

                renameButton.textContent =
                    'Rename';

                renameButton.onclick =
                    function () {

                        filenameInput.focus();

                        filenameInput.select();
                    };


                filenameContainer.appendChild(
                    filenameLabel
                );

                filenameContainer.appendChild(
                    filenameInput
                );

                filenameContainer.appendChild(
                    renameButton
                );


                // ------------------------------------------------
                // Breadcrumb
                // ------------------------------------------------

                var breadcrumb =
                    document.createElement('div');

                breadcrumb.style.padding =
                    '10px 16px';

                breadcrumb.style.borderTop =
                    '1px solid #ddd';

                breadcrumb.style.borderBottom =
                    '1px solid #ddd';

                breadcrumb.style.fontSize =
                    '14px';


                // ------------------------------------------------
                // Folder list
                // ------------------------------------------------

                var folderList =
                    document.createElement('div');

                folderList.style.padding =
                    '8px';

                folderList.style.overflow =
                    'auto';

                folderList.style.flex =
                    '1';


                // ------------------------------------------------
                // Footer
                // ------------------------------------------------

                var footer =
                    document.createElement('div');

                footer.style.padding =
                    '12px 16px';

                footer.style.borderTop =
                    '1px solid #ddd';

                footer.style.display =
                    'flex';

                footer.style.justifyContent =
                    'flex-end';

                footer.style.gap =
                    '8px';


                var cancelButton =
                    document.createElement('button');

                cancelButton.type =
                    'button';

                cancelButton.textContent =
                    'Cancel';


                var selectButton =
                    document.createElement('button');

                selectButton.type =
                    'button';

                selectButton.textContent =
                    'Select';


                footer.appendChild(cancelButton);

                footer.appendChild(selectButton);


                dialog.appendChild(header);

                dialog.appendChild(filenameContainer);

                dialog.appendChild(breadcrumb);

                dialog.appendChild(folderList);

                dialog.appendChild(footer);


                overlay.appendChild(dialog);

                document.body.appendChild(overlay);


                function close(value) {

                    overlay.remove();

                    resolve(value);
                }


                cancelButton.onclick =
                    function () {

                        close(null);
                    };


                selectButton.onclick =
                    function () {

                        var selectedFilename =
                            filenameInput.value.trim();


                        if (!selectedFilename) {

                            alert(
                                'Please enter a filename.'
                            );

                            filenameInput.focus();

                            return;
                        }


                        selectedFilename =
                            selectedFilename.replace(
                                /[\/\\]/g,
                                '_'
                            );


                        if (
                            selectedFilename === '.' ||
                            selectedFilename === '..'
                        ) {

                            alert(
                                'Invalid filename.'
                            );

                            filenameInput.focus();

                            return;
                        }


                        close(
                            {
                                path:
                                    currentPath,
                                filename:
                                    selectedFilename
                            }
                        );
                    };


                async function loadFolder(
                    path
                ) {

                    folderList.textContent =
                        'Loading…';


                    try {

                        var data =
                            await listNextcloudFolders(
                                path
                            );


                        currentPath =
                            data.path;


                        breadcrumb.textContent =
                            currentPath;


                        folderList.innerHTML =
                            '';


                        /*
                         * Parent folder button.
                         */
                        if (currentPath !== '/') {

                            var parentButton =
                                document.createElement(
                                    'button'
                                );

                            parentButton.type =
                                'button';

                            parentButton.textContent =
                                '⬆️  ..';

                            parentButton.style.display =
                                'block';

                            parentButton.style.width =
                                '100%';

                            parentButton.style.textAlign =
                                'left';

                            parentButton.style.padding =
                                '10px';

                            parentButton.style.border =
                                '0';

                            parentButton.style.background =
                                'transparent';

                            parentButton.style.cursor =
                                'pointer';


                            parentButton.onclick =
                                function () {

                                    var parts =
                                        currentPath
                                            .split('/')
                                            .filter(
                                                Boolean
                                            );

                                    parts.pop();


                                    loadFolder(
                                        parts.length
                                            ? '/' +
                                            parts.join('/')
                                            : '/'
                                    );
                                };


                            folderList.appendChild(
                                parentButton
                            );
                        }


                        /*
                         * Child folders.
                         */
                        data.folders.forEach(
                            function (folder) {

                                var folderButton =
                                    document.createElement(
                                        'button'
                                    );

                                folderButton.type =
                                    'button';

                                folderButton.textContent =
                                    '📁  ' +
                                    folder.name;

                                folderButton.style.display =
                                    'block';

                                folderButton.style.width =
                                    '100%';

                                folderButton.style.textAlign =
                                    'left';

                                folderButton.style.padding =
                                    '10px';

                                folderButton.style.border =
                                    '0';

                                folderButton.style.background =
                                    'transparent';

                                folderButton.style.cursor =
                                    'pointer';


                                folderButton.onclick =
                                    function () {

                                        loadFolder(
                                            folder.path
                                        );
                                    };


                                folderList.appendChild(
                                    folderButton
                                );
                            }
                        );

                    } catch (exception) {

                        error(
                            'Unable to load Nextcloud folders.',
                            exception
                        );

                        folderList.textContent =
                            exception.message ||
                            'Unable to load folders.';
                    }
                }


                try {

                    await loadFolder('/');

                    filenameInput.focus();

                } catch (exception) {

                    overlay.remove();

                    reject(exception);
                }
            }
        );
    }


    // ========================================================
    // Upload
    // ========================================================

    async function doUpload(
        file,
        targetPath
    ) {

        var formData =
            new FormData();

        formData.append(
            'file',
            file,
            file.name
        );

        formData.append(
            'path',
            targetPath || '/'
        );


        var response;

        try {

            response =
                await fetch(
                    NEXTCLOUD_UPLOAD_URL,
                    {
                        method: 'POST',
                        credentials: 'include',
                        body: formData
                    }
                );

        } catch (exception) {

            error(
                'Upload network request failed.',
                exception
            );

            throw exception;
        }


        var data =
            await parseJsonResponse(
                response,
                'Nextcloud upload failed'
            );


        return {
            response:
                response,
            data:
                data
        };
    }


    async function sendUpload(
        file,
        targetPath
    ) {

        var result =
            await doUpload(
                file,
                targetPath
            );


        var notAuthenticated =
            result.response.status === 401 ||
            (
                result.data &&
                result.data.error &&
                result.data.error.indexOf(
                    'Aucun utilisateur Nextcloud connecté'
                ) !== -1
            );


        if (notAuthenticated) {

            await ensureNextcloudLogin();


            result =
                await doUpload(
                    file,
                    targetPath
                );
        }


        if (
            !result.response.ok ||
            !result.data ||
            !result.data.success
        ) {

            throw new Error(
                (
                    result.data &&
                    result.data.error
                ) ||
                'Upload failed.'
            );
        }


        return result.data;
    }


    // ========================================================
    // SOGo attachment upload
    // ========================================================

    async function uploadToNextcloud(
        downloadUrl,
        filename,
        button
    ) {

        var originalHTML =
            button.innerHTML;


        button.disabled =
            true;

        button.innerHTML =
            '<md-icon class="material-icons" role="img">' +
            'hourglass_empty' +
            '</md-icon>';


        try {

            /*
             * Ensure that the user has a valid Nextcloud session.
             */
            await ensureNextcloudLogin();


            /*
             * Select the destination folder and filename.
             */
            var destination =
                await chooseNextcloudFolder(
                    filename
                );


            if (destination === null) {

                button.innerHTML =
                    originalHTML;

                button.disabled =
                    false;

                return;
            }


            /*
             * Download the attachment from SOGo.
             */
            var downloadResponse =
                await fetch(
                    downloadUrl,
                    {
                        method: 'GET',
                        credentials: 'include'
                    }
                );


            if (!downloadResponse.ok) {

                throw new Error(
                    'Unable to download attachment: HTTP ' +
                    downloadResponse.status
                );
            }


            /*
             * Preserve the original MIME type while applying
             * the filename selected by the user.
             */
            var blob =
                await downloadResponse.blob();

            var file =
                new File(
                    [blob],
                    destination.filename,
                    {
                        type:
                            blob.type ||
                            'application/octet-stream'
                    }
                );


            /*
             * Upload the file to Nextcloud.
             */
            var result =
                await sendUpload(
                    file,
                    destination.path
                );


            log(
                'Upload completed:',
                result.filename
            );


            button.innerHTML =
                '<md-icon class="material-icons" role="img">' +
                'cloud_done' +
                '</md-icon>';

            button.setAttribute(
                'title',
                'Added to Nextcloud'
            );


            setTimeout(
                function () {

                    button.innerHTML =
                        originalHTML;

                    button.disabled =
                        false;

                    button.setAttribute(
                        'title',
                        'Add to Nextcloud'
                    );

                },
                3000
            );

        } catch (exception) {

            error(
                'Upload failed.',
                exception
            );


            button.innerHTML =
                '<md-icon class="material-icons" role="img">' +
                'error' +
                '</md-icon>';

            button.setAttribute(
                'title',
                'Upload error: ' +
                exception.message
            );

            button.disabled =
                false;
        }
    }


    // ========================================================
    // Attachment button
    // ========================================================

    function addNextcloudButton(
        attachment
    ) {

        if (
            attachment.querySelector(
                '.' + BUTTON_CLASS
            )
        ) {
            return;
        }


        var downloadLink =
            attachment.querySelector(
                'a[aria-label="Sauvegarder fichier joint"]'
            );

        var filenameElement =
            attachment.querySelector(
                '.sg-attachment-name'
            );

        var actions =
            attachment.querySelector(
                'md-dialog-actions'
            );


        if (
            !downloadLink ||
            !filenameElement ||
            !actions
        ) {
            return;
        }


        var filename =
            filenameElement.getAttribute('title') ||
            filenameElement.textContent.trim();


        var button =
            document.createElement('button');

        button.type =
            'button';

        button.className =
            'sg-icon-button md-button md-ink-ripple ' +
            BUTTON_CLASS;

        button.setAttribute(
            'aria-label',
            'Add to Nextcloud'
        );

        button.setAttribute(
            'title',
            'Add to Nextcloud'
        );

        button.innerHTML =
            '<md-icon class="material-icons" role="img">' +
            'cloud_upload' +
            '</md-icon>';


        button.addEventListener(
            'click',
            function (event) {

                event.preventDefault();

                event.stopPropagation();


                uploadToNextcloud(
                    downloadLink.href,
                    filename,
                    button
                );
            }
        );


        actions.appendChild(button);

        log(
            'Button added for:',
            filename
        );
    }


    // ========================================================
    // Attachment discovery
    // ========================================================

    function processAttachments() {

        var attachments =
            document.querySelectorAll(
                '.msg-attachment-link'
            );


        attachments.forEach(
            function (attachment) {

                addNextcloudButton(
                    attachment
                );
            }
        );
    }


    // ========================================================
    // Initialization
    // ========================================================

    function initNextcloudIntegration() {

        processAttachments();


        var observer =
            new MutationObserver(
                function () {

                    processAttachments();
                }
            );


        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true
            }
        );


        log(
            'Integration initialized.',
            SOGO_ATTACH_VERSION
        );
    }


    if (
        document.readyState === 'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            initNextcloudIntegration
        );

    } else {

        initNextcloudIntegration();
    }

})();
