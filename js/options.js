/*jslint browser: true, strict: true, indent: 4 */
/*global jQuery, window, chrome, SABapi*/
(function ($, window, document) {
    "use strict";

    // some i18n
    document.title = chrome.i18n.getMessage("options_title");
    $("#authMethod option[value='apikey']").text(chrome.i18n.getMessage("options_setting_authmethod_api"));
    $("#authMethod option[value='login']").text(chrome.i18n.getMessage("options_setting_authmethod_login"));
    $("label[for='host'] sup").prop("title", chrome.i18n.getMessage("options_setting_host_help"));
    $("label[for='apiKey'] sup").prop("title", chrome.i18n.getMessage("options_setting_apikey_help"));
    $("label[for='popupHide'] sup").prop("title", chrome.i18n.getMessage("options_setting_popuphide_help"));
    $("label[for='authMethod'] sup").prop("title", chrome.i18n.getMessage("options_setting_authmethod_help"));
    $("label[for='username'] sup").prop("title", chrome.i18n.getMessage("options_setting_username_help"));
    $("label[for='password'] sup").prop("title", chrome.i18n.getMessage("options_setting_password_help"));
    $("label[for='hideCategories'] sup").prop("title", chrome.i18n.getMessage("options_setting_hidecategories_help"));
    $("label[for='matchPatterns'] sup").prop("title", chrome.i18n.getMessage("options_setting_matchpatterns_help"));
    $("a[href='#options']").text(chrome.i18n.getMessage("options_tab"));
    $("a[href='#advanced']").text(chrome.i18n.getMessage("options_tab_advanced"));
    $("a[href='#about']").text(chrome.i18n.getMessage("options_tab_about"));

    function load() {
        setVal(this, localStorage[$(this).attr("id")]);
    }

    function setVal(opt, val) {
        var opt = $(opt);
        if (opt.attr("type") === "checkbox") {
            opt.prop("checked", val === "true" ? true : false);
        } else {
            opt.val(val);
        }
    }

    function save() {
        var opt = $(this);
        var val;

        if (opt.attr("type") === "checkbox") {
            val = opt.is(":checked").toString();
        } else {
            val = opt.val();
        }

        localStorage[opt.attr("id")] = val;
    }

    /**
     * If option is not available in localStorage, default value
     * will be loaded from DOM object and put into storage.
     */
    function defaultValue() {
        var opt = $(this);
        if (!localStorage[opt.attr("id")]) {
            localStorage[opt.attr("id")] = opt.data("default");
        }
    }

    function verify(evt) {
        evt.preventDefault();
        $("#verify").button("option", "disabled", true);
        $("#verifyResult")
            .removeClass("good bad")
            .empty()
            .append($("<img>").attr("src", "images/progress.gif"));
        var api;
        if ($("#authMethod").val() === "apikey") {
            api = new SABapi($("#host").val(), $("#apiKey").val());
        } else {
            api = new SABapi($("#host").val(), $("#username").val(), $("#password").val());
        }

        var result = function (success, text) {
            $("#verify").button("option", "disabled", false);
            $("#verifyResult")
                .empty()
                .addClass(success ? "good" : "bad")
                .text(text);
        };

        api.remoteAuthMethod(function (success, responseText) {
            if (!success) {
                result(false, chrome.i18n.getMessage("options_verify_failed"));
            } else if ($("#authMethod").val() === responseText) {
                api.verifyConnection(function (success) {
                    result(success, success ? chrome.i18n.getMessage("options_verify_ok") : chrome.i18n.getMessage("options_verify_failed"));
                });
            } else if (responseText === "none") {
                result(false, chrome.i18n.getMessage("options_verify_none"));
            } else {
                result(false, chrome.i18n.getMessage("options_verify_nomatch"));
            }
        });
    }

    function reset() {
        $("#resetDialog").dialog({
            resizeable: false,
            modal: true,
            width: 400,
            title: chrome.i18n.getMessage("options_reset"),
            buttons: [
                {
                    text: chrome.i18n.getMessage("yes"),
                    click: function () {
                        $("input, select, textarea")
                            .each(function () {
                                setVal(this, $(this).data("default"));
                            })
                            .each(save);
                        authOptions.call($("#authMethod"));
                        $(this).dialog("close");
                    }
                },
                {
                    text: chrome.i18n.getMessage("no"),
                    click: function () {
                        $(this).dialog("close");
                    }
                }
            ]
        });
    }

    function authOptions() {
        if ($(this).val() === "apikey") {
            $("#apiKey").prop("disabled", false);
            $("#username, #password").prop("disabled", true);
        } else {
            $("#apiKey").prop("disabled", true);
            $("#username, #password").prop("disabled", false);
        }
    }

    function startCredits() {        
        var index = 0,
            show = function () {
                $("#credits")
                    .show("slide", {direction: "left"}, 600, function () {
                        index++;
                    })
                    .html(credits[index]);
            };

        $("#credits").data("running", true);
        show();

        window.setInterval(function () {
            if (index === credits.length) {
                index = 0;
            }

            var crdt = $("#credits");
            if (crdt.is(":visible")) {
                crdt.fadeOut(400, show);
            } else {
                show();
            }
        }, 6000);
    }

    $(window).unload(function () {
        chrome.extension.sendRequest({action: "reloadConfig"});
    });

    $("input, select, textarea")
        .each(defaultValue)
        .each(load)
        .keyup(save)
        .change(save)
        .click(save);

    $("#verify")
        .text(chrome.i18n.getMessage("options_verify"))
        .button()
        .click(verify);

    $("#reset")
        .text(chrome.i18n.getMessage("options_reset"))
        .button()
        .click(reset);

    $("#authMethod")
        .each(authOptions)
        .change(authOptions);

    $("#host")
        .focus()
        .select();

    $("#tabs").tabs({
        select: function (evt, ui) {
            if (ui.index === 2 && $("#changelog").children().length === 0) {
                $.get("/CHANGELOG.md", function (data) {
                    $("#changelog").html(new Showdown.converter().makeHtml(data));
                });
            } else if (ui.index === 3 && $("#credits").data("running") === false) {
                window.setTimeout(startCredits, 500);
            }
        }
    });
    
    var credits = [
        "The SABnzbd team",
        "The jQuery and jQuery UI developers for great and very useful JavaScript libraries",
        "Google for their Chrome browser and other products",
        "GitHub for hosting this project",
        "My girlfriend for her patience ♥"
    ];
}(jQuery, window, document));
