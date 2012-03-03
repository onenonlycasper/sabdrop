/*jshint browser: true, indent: 4 */
/*global console, chrome, webkitNotifications, SABdrop, SABapi*/
(function () {
    'use strict';

    window.pageActionData = []; // TODO: Is there a better way to send data to the page action?

    var MAX_SPEED_HISTORY = 10,
        HISTORY_LIMIT = 10,

        api,
        popupHide = localStorage.popupHide || 5000,
        requestInterval = null,
        cache = {
            queue: {},
            history: {},
            downloads: [],
            speedHistory: []
        };

    if (localStorage.authMethod === 'login') {
        api = new SABapi(localStorage.host, localStorage.username, localStorage.password);
    } else {
        api = new SABapi(localStorage.host, localStorage.apiKey);
    }

    function resetInterval() {
        if (requestInterval) {
            window.clearInterval(requestInterval);
        }

        requestInterval = window.setInterval(queryAPI, parseInt(localStorage.requestInterval, 10) || 10000);
    }

    function sendLink(link, category, name) {
        var basename = SABdrop.Common.basename(link),
            method;

        if (category === undefined) {
            category = null;
        }

        if (name === undefined) {
            name = null;
        }

        if (localStorage.nzbName === 'always' && name === null) {
            // Show notification popup asking for NZB name

            webkitNotifications.createHTMLNotification(
                'ui_notification.html#' + JSON.stringify({
                    link: link,
                    category: category,
                    basename: basename
                })
            ).show();

        } else {
            // Send link to SABnzbd

            name = (name !== null ? name : basename);
            method = localStorage.fileUpload === 'true' ? api.sendFile : api.sendLink;

            method.call(api, link, name, category, function (success) {
                var title,
                    text,
                    notification;

                if (success) {
                    title = chrome.i18n.getMessage('sent_popup_title');
                    text = chrome.i18n.getMessage('sent_popup_text', SABdrop.Common.truncate(name, 20));
                } else {
                    title = chrome.i18n.getMessage('error_popup_title');
                    text = chrome.i18n.getMessage('error_popup_text');
                }

                showNotification(title, text);
            });
        }
    }

    function createContextMenus() {
        chrome.contextMenus.removeAll();

        var contextMenuId = chrome.contextMenus.create({
            'title': chrome.i18n.getMessage('context_menu'),
            'contexts': ['link'],
            'onclick': function (info, tab) {
                sendLink(info.linkUrl);
            }
        });

        if (localStorage.hideCategories === 'true') {
            return;
        }

        api.getCategories(function (categories) {
            if (categories.length > 0) {
                chrome.contextMenus.create({
                    'title': chrome.i18n.getMessage('context_menu_nocategory'),
                    'contexts': ['link'],
                    'parentId': contextMenuId,
                    'onclick': function (info, tab) {
                        sendLink(info.linkUrl);
                    }
                });

                categories.forEach(function (cat) {
                    chrome.contextMenus.create({
                        'title': cat,
                        'contexts': ['link'],
                        'parentId': contextMenuId,
                        'onclick': function (info, tab) {
                            sendLink(info.linkUrl, cat);
                        }
                    });
                });
            }
        });
    }

    function onStart() {
        createContextMenus();

        // open options page if extension hasn't been configured yet
        if (!localStorage.host) {
            chrome.tabs.create({url: 'ui_options.html'});
        }

        // migration from 0.4.1 -> 0.5
        if (localStorage.host && !localStorage.nzbName) {
            localStorage.nzbName = 'always';
        }

        // migration from 0.6.1 -> 0.6.2
        if (!localStorage.requestInterval) {
            localStorage.requestInterval = '10000';
        }
    }

    function showNotification(title, text) {
        if (popupHide === 0) {
            return;
        }

        var notification = webkitNotifications.createNotification(
            'images/icons/sab48.png',
            title,
            text
        );

        notification.ondisplay = function () {
            window.setTimeout(function () {
                notification.cancel();
            }, popupHide);
        };

        notification.show();
    }

    function setBadgeText(count) {
        chrome.browserAction.setBadgeText({
            text: count === 0 || count === null ? '' : count.toString()
        });
    }

    function queryAPI() {
        api.getQueue(function (queue) {
            cache.queue = queue;

            queue.slots.forEach(function (slot) {
                if ($.inArray(slot.nzo_id, cache.downloads) === -1) {
                    cache.downloads.push(slot.nzo_id);
                }
            });

            setBadgeText(queue.slots.length);
        });

        api.getHistory(HISTORY_LIMIT, function (history) {
            var index, 
                notification;

            cache.history = history;
            cache.speedHistory.push(parseFloat(history.kbpersec));

            if (cache.speedHistory.length > MAX_SPEED_HISTORY) {
                cache.speedHistory.splice(0, 1);
            }

            history.slots.forEach(function (slot) {
                index = $.inArray(slot.nzo_id, cache.downloads);

                if (index > -1 && slot.status === 'Completed') {
                    cache.downloads.splice(index, 1);
                    showNotification(chrome.i18n.getMessage('completed_popup_title'), chrome.i18n.getMessage('completed_popup_text', SABdrop.Common.truncate(slot.name, 20)));
                }
            });
        });
    }

    chrome.extension.onRequest.addListener(function (request, sender, sendResponse) {
        switch (request.action) {

        case 'pageAction':
            window.pageActionData[sender.tab.id] = request.data;
            chrome.pageAction.show(sender.tab.id);
            break;

        case 'downloadLink':
            sendLink(request.link, request.category, request.name);
            break;

        case 'reloadConfig':
            console.info('Reloading SABdrop configuration');
            api.setHost(localStorage.host);

            if (localStorage.authMethod === 'login') {
                api.setAuthMethod('login');
                api.setUsername(localStorage.username);
                api.setPassword(localStorage.password);
            } else {
                api.setAuthMethod('apikey');
                api.setAPIKey(localStorage.apiKey);
            }

            createContextMenus(); // recreate menus because of categories
            resetInterval();
            break;

        case 'getCategories':
            if (localStorage.hideCategories === 'true') {
                sendResponse([]);
            } else {
                api.getCategories(function (categories) {
                    sendResponse(categories);
                });
            }
            return;

        case 'getLocalStorage':
            sendResponse(localStorage[request.attribute]);
            return;

        case 'getQueue':
            sendResponse(cache.queue);
            return;

        case 'getHistory':
            sendResponse(cache.history);
            return;
        
        case 'getSlots':
            sendResponse(cache.queue.slots);
            return;
        
        case 'pauseDownload':
            api.pauseDownload(request.id);
            return;

        case 'resumeDownload':
            api.resumeDownload(request.id);
            return;

        case 'deleteDownload':
            api.deleteDownload(request.id);
            var index = $.inArray(request.id, cache.downloads);
            if (index > -1) {
                cache.downloads.splice(index, 1);
                setBadgeText(cache.downloads.length);
            }
            return;

        case 'moveDownload':
            api.moveDownload(request.id, request.position);
            return;

        case 'pauseAll':
            api.pauseAll();
            return;

        case 'resumeAll':
            api.resumeAll();
            return;

        case 'deleteAll':
            api.deleteAll();
            cache.downloads = [];
            setBadgeText(null);
            return;

        case 'getSpeedHistory':
            sendResponse(cache.speedHistory);
            return;

        case 'setSpeedLimit':
            api.setSpeedLimit(request.limit);
            cache.queue.speedlimit = request.limit === 0 ? '' : request.limit;
            return;

        }

        sendResponse({}); // clean up
    });

    onStart();
    queryAPI();
    resetInterval();

}());
