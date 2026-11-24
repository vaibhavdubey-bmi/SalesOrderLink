sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "com/bmi/orderquotematch/project1/model/formatter",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/Fragment",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/FlexItemData",
    "sap/m/OverflowToolbarLayoutData",
    "sap/ui/core/BusyIndicator",
    "sap/base/strings/formatMessage"
], function (
    JSONModel,
    formatter,
    Filter,
    FilterOperator,
    Fragment,
    MessageBox,
    MessageToast,
    FlexItemData,
    OverflowToolbarLayoutData,
    BusyIndicator,
    formatMessage
) {
    "use strict";

    var REJECT_BTN_ID = "com.bmi.orderquotematch.project1::sap.suite.ui.generic.template.ObjectPage.view.Details::ZC_QTO_SO_QT--action::cds_zsd_qto_so_qt.cds_zsd_qto_so_qt_Entities::Reject_link";

    // For an entry that is already rejected the Reject Link button LOOKS disabled (greyed out). Clicking it shows
    // the "already rejected" popup; the Reject dialog, the action and the jump back to the list are blocked.
    // true  -> additionally switch the button technically OFF (then it cannot be clicked, so no popup is shown)
    // false -> (default) the button stays clickable so that the popup can explain why it is greyed out
    var DISABLE_REJECT_BUTTON_WHEN_REJECTED = false;


    return {


        // Existing formatter + one helper used by the XML fragments for texts with placeholders ({0}, {1}).
        formatter: Object.assign({}, formatter, {
            formatText: function (sPattern) {
                return formatMessage(sPattern || "", Array.prototype.slice.call(arguments, 1));
            }
        }),

        /* ========================================================= */
        /* i18n helper                                               */
        /* ========================================================= */
        _getText: function (sKey, aArgs) {
            var oModel = this.getView().getModel("i18n");
            var oBundle = oModel && oModel.getResourceBundle();
            return oBundle && oBundle.getText ? oBundle.getText(sKey, aArgs) : sKey;
        },


        /* ========================================================= */
        /* INIT                                                      */
        /* ========================================================= */
        onInit: function () {
            var oView = this.getView();

            var that = this;


            console.log("SalesQuotation Controller Loaded");


            oView.attachModelContextChange(function () {
                this._refreshMatchModel();
                this._loadUnmatchedPairs();   // change#um-pair
                this._updateRejectButtonState();
            }.bind(this));


            this._onDocClick = function (oEvent) {
                // language independent: detect the standard "Return to list" button by its id, not by its text
                var oTarget = oEvent.target;
                var oReturnBtnDom = oTarget && oTarget.closest ? oTarget.closest('[id*="Return_to_list"]') : null;

                if (oReturnBtnDom) {
                    that._showActionMessage("return");   // message on the list page (Sales Order / Quotation number)
                    //Wait until the action has finished, refresh the list, go back once
                    that._returnToList(false);   // plain return: light refresh
                }
            };
            document.addEventListener("click", this._onDocClick);

            // capture phase = runs before the standard FE handlers navigate, so the prompt cannot appear
            if (window.__qtoClearDirtyOnClick) {
                document.removeEventListener("click", window.__qtoClearDirtyOnClick, true);
            }
            window.__qtoClearDirtyOnClick = function (oEvent) {
                var oT = oEvent.target;

                // Reject dialog: the button with the same text as the Reject action = confirm, any other = cancel
                if (that._rejectPending && oT && oT.closest && oT.closest(".sapMDialog")) {
                    var oBtnDom = oT.closest(".sapMBtn");
                    if (oBtnDom) {
                        var oBtn = sap.ui.getCore().byId(oBtnDom.id);
                        var oRej = sap.ui.getCore().byId(
                            "com.bmi.orderquotematch.project1::sap.suite.ui.generic.template.ObjectPage.view.Details::ZC_QTO_SO_QT--action::cds_zsd_qto_so_qt.cds_zsd_qto_so_qt_Entities::Reject_link"
                        );
                        that._rejectPending = false;
                        if (oBtn && oRej && oBtn.getText && oRej.getText && oBtn.getText() === oRej.getText()) {
                            that._rejectTriggered = true;
                        }
                    }
                }
                if (oT && oT.closest && oT.closest('[id*="Return_to_list"], [id*="Reject"], [id*="Reset"], [id*="Link"]')) {
                    that._clearDirtyFlag();
                }
            };
            document.addEventListener("click", window.__qtoClearDirtyOnClick, true);

            // Already rejected entry: block the Reject Link button BEFORE the standard handler opens the
            // "Are you sure you want to reject?" dialog, and tell the user why. Nothing is sent to the
            // backend and the user stays on the entry (no jump back to the list).
            if (window.__qtoBlockRejected) {
                document.removeEventListener("click", window.__qtoBlockRejected, true);
                document.removeEventListener("keydown", window.__qtoBlockRejected, true);
                document.removeEventListener("keyup", window.__qtoBlockRejected, true);
            }
            this._fnBlockRejected = function (oEvent) {
                var oT = oEvent.target;

                // go up to the real UI5 button element (inner spans/icons have ids like ...Reject_link-inner,
                // which byId() cannot resolve, so the block was skipped when the text/icon was clicked)
                var oBtnDom = oT && oT.closest ? oT.closest(".sapMBtn") : null;
                if (!oBtnDom || !oBtnDom.id || oBtnDom.id.indexOf("Reject_link") === -1) { return; }

                if (oEvent.type !== "click" &&
                    !(oEvent.key === "Enter" || oEvent.key === " " || oEvent.key === "Spacebar")) {
                    return;
                }

                var oBtn = sap.ui.getCore().byId(oBtnDom.id);
                if (!oBtn || !that._isRejectedCtx(oBtn.getBindingContext())) { return; }

                oEvent.stopImmediatePropagation();
                oEvent.preventDefault();
                if (oEvent.type !== "keyup") {
                    that._showAlreadyRejected();
                }
            };
            window.__qtoBlockRejected = this._fnBlockRejected;
            document.addEventListener("click", this._fnBlockRejected, true);
            document.addEventListener("keydown", this._fnBlockRejected, true);
            document.addEventListener("keyup", this._fnBlockRejected, true);


            this._rejectTriggered = false;
            this._rejectPending = false;
            this._linkTriggered = false;


            var oModel = this.getOwnerComponent().getModel();


           if (oModel) {
                // handlers are stored so they can be detached in onExit (the model is shared by the whole app)
                this._fnOnRequestCompleted = function (oEvent) {
                    console.log("REQUEST COMPLETED");
                    that._clearDirtyFlag();
                    that._updateRejectButtonState();

                    if (!oEvent.getParameter("success")) {
                        return;
                    }

                    //Was this completion caused by Reject?
                    if (that._rejectTriggered) {
                        that._rejectTriggered = false; //reset flag

                        that._showActionMessage("reject");   // message on the list page
                        that._requestListRefresh();
                        that._navigateToList();

                        return;
                    }
                };
                oModel.attachRequestCompleted(this._fnOnRequestCompleted);

                this._fnOnRequestFailed = function () {
                    console.log("REQUEST FAILED");
                    that._rejectTriggered = false;
                    BusyIndicator.hide();
                };
                oModel.attachRequestFailed(this._fnOnRequestFailed);

                 // Browser back handling
                this._onBrowserBack = function () {

                    console.log("POPSTATE FIRED");
                    that._clearDirtyFlag();

                    // ignore the back navigation that we triggered ourselves:
                    // history.go(-1) can fire more than one popstate, and a second one must not
                    // press Return to list / refresh the list again
                    if (that._bReturning || Date.now() < (that._iIgnorePopstateUntil || 0)) {
                        that._bNavigatingBack = false;
                        return;
                    }

                    // ignore the back navigation that we triggered ourselves
                    if (that._bNavigatingBack) {
                        that._bNavigatingBack = false;
                        return;
                    }

                    // Trigger standard FE Return To List button
                    var oReturnBtn = sap.ui.getCore().byId(
                        "com.bmi.orderquotematch.project1::sap.suite.ui.generic.template.ObjectPage.view.Details::ZC_QTO_SO_QT--action::cds_zsd_qto_so_qt.cds_zsd_qto_so_qt_Entities::Return_to_list"
                    );

                    if (oReturnBtn) {
                        // refresh the list once the action has finished
                        that._whenActionDone(function () {
                            that._requestListRefresh(false);
                        }, 5000);

                        oReturnBtn.firePress();
                    } else {
                        that._requestListRefresh(false);
                    }
                };

                window.addEventListener(
                    "popstate",
                    this._onBrowserBack
                );

                //change#2
                // Reset button
                var oResetBtn = sap.ui.getCore().byId(
                    "com.bmi.orderquotematch.project1::sap.suite.ui.generic.template.ObjectPage.view.Details::ZC_QTO_SO_QT--action::cds_zsd_qto_so_qt.cds_zsd_qto_so_qt_Entities::Reset"
                );

                if (oResetBtn && !oResetBtn.data("resetAttached")) {

                    oResetBtn.setIcon("sap-icon://reset");

                    oResetBtn.attachPress(function () {
                        // The status is read NOW, before the action runs and changes it.
                        // Rejected entry  -> stay on this entry (refresh it), so the user can link right away.
                        // Any other entry -> as before: refresh the list and go back to it.
                        var oResetCtx = that.getView().getBindingContext();
                        if (that._isRejectedCtx(oResetCtx)) {
                            that._afterReset();
                        } else {
                            // status "New": go back to the list without the banner; other statuses: with banner
                            that._returnToList(true, that._isNewCtx(oResetCtx));   // Reset changes data -> full refresh
                        }
                    });

                    oResetBtn.data("resetAttached", true);
                }

            }

            if (this._backHandlerAttached) {
                return;
            }


            this._backHandlerAttached = true;

            this._onResizePin = function () {
                that._pinHeaderActions(true);
            };
            window.addEventListener("resize", this._onResizePin);


            setTimeout(function () {
                var fnHideVaActions = function () {
                    var iHidden = 0;

                    sap.ui.core.Element.registry.forEach(function (oControl) {
                        var sId = oControl && oControl.getId();

                        if (sId &&
                            (sId.indexOf("::VA03") !== -1 || sId.indexOf("::VA23") !== -1) &&
                            oControl.isA("sap.m.Button")) {
                            oControl.setVisible(false);
                            iHidden++;
                        }
                    });

                    return iHidden > 0;
                };


                var iHideAttempts = 0;
                var oHideInterval = setInterval(function () {
                    iHideAttempts++;

                    if (fnHideVaActions() || iHideAttempts >= 30) {
                        clearInterval(oHideInterval);
                    }
                }, 300);

                //linkdoc button
                var fnFindAndAttachLinkDocs = function () {
                    var oLinkDocs = null;

                    sap.ui.core.Element.registry.forEach(function (oControl) {
                        if (oLinkDocs || !oControl) {
                            return;
                        }

                        var sId = oControl.getId();

                        if (sId && sId.indexOf("::Linkdocs") !== -1) {
                            oLinkDocs = oControl;
                        }
                    });

                    if (!oLinkDocs) {
                        return false;
                    }

                    that._pinHeaderActions(true);

                    if (oLinkDocs.setIcon) {
                        oLinkDocs.setIcon("sap-icon://chain-link");
                    }

                    if (oLinkDocs.rerender) {
                        oLinkDocs.rerender();
                    }

                    if (oLinkDocs.data("linkDocsHandlerAttached")) {
                        return true;
                    }

                    if (oLinkDocs.attachPress) {
                        if (oLinkDocs.mEventRegistry && oLinkDocs.mEventRegistry.press) {
                            window._originalLinkDocsPress = oLinkDocs.mEventRegistry.press.slice();
                            oLinkDocs.mEventRegistry.press = [];
                        }

                        //when press linkdoc
                        oLinkDocs.attachPress(function () {
                            that._linkTriggered = true;
                            that.onLinkDocsPress();
                        });
                    } else {
                        return false;
                    }

                    oLinkDocs.data("linkDocsHandlerAttached", true);
                    return true;
                };


                var iAttempts = 0;
                var oLinkDocsInterval = setInterval(function () {
                    iAttempts++;

                    if (fnFindAndAttachLinkDocs()) {
                        clearInterval(oLinkDocsInterval);
                    }

                    if (iAttempts >= 30) {
                        clearInterval(oLinkDocsInterval);
                        console.error("Link Docs action could not be found after 30 attempts.");
                    }
                }, 300);


                var iPinTicks = 0;
                var oPinInterval = setInterval(function () {
                    iPinTicks++;
                    that._pinHeaderActions(iPinTicks === 2 || iPinTicks % 5 === 0);
                    that._updateRejectButtonState();

                    if (iPinTicks >= 40) {
                        clearInterval(oPinInterval);
                    }
                }, 500);

                // Return To List: handled by the delegated click handler (_onDocClick)
                // and by _onBrowserBack -> no separate attachPress needed.

                //taking reject button 
                var oReject = sap.ui.getCore().byId(
                    "com.bmi.orderquotematch.project1::sap.suite.ui.generic.template.ObjectPage.view.Details::ZC_QTO_SO_QT--action::cds_zsd_qto_so_qt.cds_zsd_qto_so_qt_Entities::Reject_link"
                );

                if (oReject) {
                    oReject.setIcon("sap-icon://sys-cancel"); //adding cancle icon
                    oReject.rerender();

                    oReject.attachPress(function () {
                        // only "armed": navigation starts after the user CONFIRMS in the Reject dialog
                        that._rejectPending = true;
                    });

                    that._updateRejectButtonState();
                }

            }, 200);
        },


        /* ========================================================= */
        /* MESSAGE AFTER REJECT / RESET / RETURN TO LIST             */
        /* ========================================================= */

        // Message shown on the list page (a MessageToast belongs to the page body, so it stays visible while
        // the app navigates back) with the Sales Order and Quotation number of the entry the action was done on.
        // sAction: "reject" | "reset" | "return"
        _showActionMessage: function (sAction) {
            try {
                var oDocs = this._oLastDocs;
                var oCtx = this.getView().getBindingContext();
                var oData = oCtx && oCtx.getObject && oCtx.getObject();
                if (oData && (oData.salesDoc || oData.qt_salesDoc)) {
                    oDocs = { so: oData.salesDoc || "", qt: oData.qt_salesDoc || "" };
                }
                if (!oDocs) { return; }

                // one user action = one message (also when more than one controller instance is listening)
                var iNow = Date.now();
                var sKey = sAction + "|" + oDocs.so + "|" + oDocs.qt;
                if (window.__qtoLastActionMsg && window.__qtoLastActionMsg.key === sKey &&
                    (iNow - window.__qtoLastActionMsg.at) < 2000) {
                    return;
                }
                window.__qtoLastActionMsg = { key: sKey, at: iNow };

                var mTitles = {
                    reject: ["actionTitleReject", "Link rejected"],
                    reset: ["actionTitleReset", "Link reset"],
                    "return": ["actionTitleReturn", "Returned to list"]
                };
                var aT = mTitles[sAction];

                this._renderActionBannerOnList(
                    sAction,
                    this._getTextOrDefault(aT[0], aT[1]),
                    [
                        [this._getTextOrDefault("salesOrder", "Sales Order"), oDocs.so || "-"],
                        [this._getTextOrDefault("quotation", "Quotation"), oDocs.qt || "-"]
                    ]
                );
            } catch (e) { /* a message must never break the action */ }
        },


        // The data of the banner is collected right away (the entry is still open), but the banner itself is only
        // shown once the app has left the object page, so it appears on the list page and not on the entry page
        // while the app is still navigating back. If the app has not left the entry after 8 s the banner is shown
        // anyway, so the information is never lost.
        _renderActionBannerOnList: function (sType, sTitle, aItems) {
            var that = this;
            var iStart = Date.now();

            if (window.__qtoBannerTimer) {
                clearInterval(window.__qtoBannerTimer);
                window.__qtoBannerTimer = null;
            }

            window.__qtoBannerTimer = setInterval(function () {
                var bOnObjectPage = /&\/ZC_QTO_SO_QT\(/.test(window.location.hash || "");
                var bTimeout = (Date.now() - iStart) > 8000;

                if (bOnObjectPage && !bTimeout) { return; }   // still on the entry -> keep waiting

                clearInterval(window.__qtoBannerTimer);
                window.__qtoBannerTimer = null;

                // short pause so that the list page is already visible
                setTimeout(function () {
                    that._renderActionBanner(sType, sTitle, aItems);
                }, 400);
            }, 100);
        },


        // Prominent banner at the top of the screen. Plain DOM (no UI5 popup), so it stays on screen while the
        // app navigates back to the list. Closes itself after ~12 s (paused while the mouse is over it) or via X.
        _renderActionBanner: function (sType, sTitle, aItems) {
            var oOld = document.getElementById("qtoActionBanner");
            if (oOld && oOld.parentNode) { oOld.parentNode.removeChild(oOld); }

            if (!document.getElementById("qtoActionBannerStyle")) {
                var oStyle = document.createElement("style");
                oStyle.id = "qtoActionBannerStyle";
                oStyle.textContent =
                    ".qtoAB{position:fixed;top:64px;left:50%;z-index:100000;box-sizing:border-box;display:flex;align-items:flex-start;gap:12px;" +
                    "min-width:360px;max-width:min(92vw,760px);padding:14px 14px 16px 14px;border-radius:12px;overflow:hidden;" +
                    "background:var(--qtoAB-bg);border:1px solid var(--qtoAB-accent);border-left:6px solid var(--qtoAB-accent);" +
                    "box-shadow:0 10px 30px rgba(0,0,0,.22);font-family:var(--sapFontFamily,'72','72full',Arial,sans-serif);" +
                    "color:#1f2937;opacity:0;transform:translate(-50%,-14px);transition:opacity .25s ease,transform .25s ease;}" +
                    ".qtoAB.qtoAB-in{opacity:1;transform:translate(-50%,0);}" +
                    ".qtoAB--reject{--qtoAB-accent:#d92d20;--qtoAB-bg:#fff1f0;}" +
                    ".qtoAB--reset{--qtoAB-accent:#d4730c;--qtoAB-bg:#fff7ed;}" +
                    ".qtoAB--return{--qtoAB-accent:#0a6ed1;--qtoAB-bg:#eef5ff;}" +
                    ".qtoAB-icon{flex:none;width:34px;height:34px;border-radius:50%;background:var(--qtoAB-accent);color:#fff;" +
                    "display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;line-height:1;}" +
                    ".qtoAB-body{flex:1 1 auto;min-width:0;}" +
                    ".qtoAB-title{font-size:1.05rem;font-weight:700;color:var(--qtoAB-accent);margin:0 0 8px 0;}" +
                    ".qtoAB-row{display:flex;flex-wrap:wrap;gap:8px;}" +
                    ".qtoAB-chip{display:inline-flex;align-items:baseline;gap:8px;padding:4px 12px;border-radius:999px;background:#fff;" +
                    "border:1px solid var(--qtoAB-accent);}" +
                    ".qtoAB-lbl{font-size:.8rem;font-weight:600;color:#4b5563;text-transform:uppercase;letter-spacing:.4px;}" +
                    ".qtoAB-val{font-size:1.1rem;font-weight:700;color:#111827;}" +
                    ".qtoAB-close{flex:none;border:0;background:transparent;color:#4b5563;font-size:22px;line-height:1;cursor:pointer;" +
                    "padding:0 4px;border-radius:6px;}" +
                    ".qtoAB-close:hover{background:rgba(0,0,0,.08);}" +
                    ".qtoAB-bar{position:absolute;left:0;bottom:0;height:4px;width:100%;background:var(--qtoAB-accent);opacity:.55;" +
                    "transform-origin:left;animation:qtoABbar 12s linear forwards;}" +
                    ".qtoAB:hover .qtoAB-bar{animation-play-state:paused;}" +
                    "@keyframes qtoABbar{from{transform:scaleX(1);}to{transform:scaleX(0);}}";
                document.head.appendChild(oStyle);
            }

            var el = function (sTag, sCls, sText) {
                var o = document.createElement(sTag);
                if (sCls) { o.className = sCls; }
                if (sText !== undefined) { o.textContent = sText; }   // textContent: values are never parsed as HTML
                return o;
            };

            var oBox = el("div", "qtoAB qtoAB--" + sType);
            oBox.id = "qtoActionBanner";
            oBox.setAttribute("role", "status");
            oBox.setAttribute("aria-live", "polite");

            var mIcons = { reject: "\u2715", reset: "\u21BA", "return": "\u2190" };
            oBox.appendChild(el("div", "qtoAB-icon", mIcons[sType] || "i"));

            var oBody = el("div", "qtoAB-body");
            oBody.appendChild(el("div", "qtoAB-title", sTitle));
            var oRow = el("div", "qtoAB-row");
            aItems.forEach(function (aItem) {
                var oChip = el("span", "qtoAB-chip");
                oChip.appendChild(el("span", "qtoAB-lbl", aItem[0]));
                oChip.appendChild(el("span", "qtoAB-val", aItem[1]));
                oRow.appendChild(oChip);
            });
            oBody.appendChild(oRow);
            oBox.appendChild(oBody);

            var oClose = el("button", "qtoAB-close", "\u00D7");
            oClose.setAttribute("type", "button");
            oClose.setAttribute("aria-label", "Close");
            oBox.appendChild(oClose);

            var oBar = el("div", "qtoAB-bar");
            oBox.appendChild(oBar);

            var fnClose = function () {
                oBox.classList.remove("qtoAB-in");
                setTimeout(function () { if (oBox.parentNode) { oBox.parentNode.removeChild(oBox); } }, 300);
            };
            oClose.addEventListener("click", fnClose);
            oBar.addEventListener("animationend", fnClose);   // the shrinking bar is the timer

            document.body.appendChild(oBox);
            setTimeout(function () { oBox.classList.add("qtoAB-in"); }, 30);
        },


        /* ========================================================= */
        /* ALREADY REJECTED ENTRY                                    */
        /* ========================================================= */

        // i18n text with an English fallback (works before the keys are added to the i18n files)
        _getTextOrDefault: function (sKey, sDefault) {
            var sText = this._getText(sKey);
            return (!sText || sText === sKey) ? sDefault : sText;
        },

        // true when the entry behind this binding context has the status "Rejected"
        _isRejectedCtx: function (oCtx) {
            try {
                var oData = oCtx && oCtx.getObject && oCtx.getObject();
                var sStatus = oData && oData.status;
                return !!sStatus && (sStatus === "Rejected" || sStatus === this._getText("statusRejected"));
            } catch (e) {
                return false;
            }
        },

        // true when the entry behind this binding context has the status "New"
        _isNewCtx: function (oCtx) {
            try {
                var oData = oCtx && oCtx.getObject && oCtx.getObject();
                var sStatus = oData && oData.status;
                return !!sStatus && (sStatus === "New" || sStatus === this._getText("statusNew"));
            } catch (e) {
                return false;
            }
        },

        _showAlreadyRejected: function () {
            var that = this;
            if (this._bRejectInfoOpen) { return; }
            this._bRejectInfoOpen = true;

            MessageBox.information(
                this._getTextOrDefault("rejectAlreadyRejectedMessage",
                    "This entry is already rejected and cannot be rejected again."),
                {
                    title: this._getTextOrDefault("rejectAlreadyRejectedTitle", "Already Rejected"),
                    onClose: function () { that._bRejectInfoOpen = false; }
                }
            );
        },

        // greyed-out look for the Reject Link button (added once; the button itself is not re-rendered)
        _ensureRejectedStyle: function () {
            if (document.getElementById("qtoAlreadyRejectedStyle")) { return; }
            var oStyle = document.createElement("style");
            oStyle.id = "qtoAlreadyRejectedStyle";
            oStyle.textContent =
                "button.qtoAlreadyRejected { opacity: 0.45 !important; }" +
                "button.qtoAlreadyRejected, button.qtoAlreadyRejected * { cursor: not-allowed !important; }";
            document.head.appendChild(oStyle);
        },

        // Shows the Reject Link button greyed out while an already rejected entry is displayed and back to
        // normal for every other entry (the object page view is reused when the user opens the next entry).
        // Only runs when the state really changes, so the toolbar is not touched on every call.
        _updateRejectButtonState: function () {
            try {
                var oReject = sap.ui.getCore().byId(REJECT_BTN_ID);
                if (!oReject) { return; }

                // control-level guard (installed once): a rejected entry can never fire the press event,
                // whatever triggered it (DOM click, keyboard, code). Re-checks the context on every call,
                // so it does nothing for entries that are not rejected.
                if (!oReject.__qtoOrigFirePress) {
                    var that = this;
                    oReject.__qtoOrigFirePress = oReject.firePress;
                    oReject.firePress = function () {
                        if (that._isRejectedCtx(this.getBindingContext())) {
                            that._showAlreadyRejected();
                            return this;
                        }
                        return this.__qtoOrigFirePress.apply(this, arguments);
                    };
                }

                var bRejected = this._isRejectedCtx(oReject.getBindingContext());
                var bApplied = !!oReject.data("qtoRejectedApplied");
                if (bRejected === bApplied) { return; }   // nothing changed -> do nothing

                if (bRejected) {
                    this._ensureRejectedStyle();
                    oReject.data("qtoRejectedApplied", true);
                    oReject.data("qtoOrigTooltip", oReject.getTooltip_AsString ? oReject.getTooltip_AsString() : "");
                    oReject.addStyleClass("qtoAlreadyRejected");
                    oReject.setTooltip(this._getTextOrDefault("rejectAlreadyRejectedMessage",
                        "This entry is already rejected and cannot be rejected again."));

                    if (DISABLE_REJECT_BUTTON_WHEN_REJECTED && oReject.getEnabled()) {
                        oReject.data("qtoDisabledByUs", true);
                        oReject.setEnabled(false);
                    }
                } else {
                    // only undo what this code did - never override the standard behaviour
                    oReject.data("qtoRejectedApplied", false);
                    oReject.removeStyleClass("qtoAlreadyRejected");
                    oReject.setTooltip(oReject.data("qtoOrigTooltip") || oReject.getText());

                    if (oReject.data("qtoDisabledByUs")) {
                        oReject.data("qtoDisabledByUs", false);
                        oReject.setEnabled(true);
                    }
                }
            } catch (e) { /* never block the page because of this */ }
        },


        _pinHeaderActions: function (bForceReset) {
            var that = this;
            var aToolbars = [];

            sap.ui.core.Element.registry.forEach(function (oCtl) {
                if (oCtl && oCtl.isA && oCtl.isA("sap.m.OverflowToolbar") &&
                    oCtl.getContent().some(function (oItem) {
                        var sId = oItem.getId();
                        return sId.indexOf("::Linkdocs") !== -1 ||
                               sId.indexOf("::Reject_link") !== -1;
                    })) {
                    aToolbars.push(oCtl);
                }
            });

            aToolbars.forEach(function (oToolbar) {
                var bChanged = that._applyPins(oToolbar);

                if (!oToolbar.data("headerPinDelegate")) {
                    oToolbar.data("headerPinDelegate", true);
                    oToolbar.addEventDelegate({
                        onBeforeRendering: function () {
                            that._applyPins(oToolbar);
                        }
                    });
                    console.log("Header actions pinned on:", oToolbar.getId());
                    bChanged = true;
                }

                if ((bChanged || bForceReset) && oToolbar._resetAndInvalidateToolbar) {
                    oToolbar._resetAndInvalidateToolbar();
                }
            });
        },


        _applyPins: function (oToolbar) {
            var bChanged = false;

            oToolbar.getContent().forEach(function (oItem) {
                var sId = oItem.getId();

                if (sId.indexOf("::Linkdocs") === -1 &&
                    sId.indexOf("::Reject_link") === -1 &&
                    sId.indexOf("::Return_to_list") === -1) {
                    return;
                }

                if (oItem.getText && oItem.getText() && !oItem.getTooltip()) {
                    oItem.setTooltip(oItem.getText());
                }

                var oLayout = oItem.getLayoutData();

                if (oLayout && oLayout.isA("sap.m.OverflowToolbarLayoutData")) {
                    if (oLayout.getPriority() !== "NeverOverflow") {
                        oLayout.setPriority("NeverOverflow");
                        bChanged = true;
                    }

                    if (oLayout.getMoveToOverflow && oLayout.getMoveToOverflow()) {
                        oLayout.setMoveToOverflow(false);
                        bChanged = true;
                    }

                    if (oLayout.getStayInOverflow && oLayout.getStayInOverflow()) {
                        oLayout.setStayInOverflow(false);
                        bChanged = true;
                    }
                } else {
                    oItem.setLayoutData(new OverflowToolbarLayoutData({
                        priority: "NeverOverflow"
                    }));
                    bChanged = true;
                }
            });

            return bChanged;
        },


        _openVA03: function () {
            var oContext = this.getView().getBindingContext();

            if (!oContext) {
                console.error("VA03: Binding context not available.");
                return;
            }

            var oData = oContext.getObject();
            var oS4 = this._getS4Config();

            if (!oData.salesDoc) {
                console.error("VA03: salesDoc is empty.");
                return;
            }

            var sUrl = oS4.host +
                "/sap/bc/ui2/flp?sap-client=" + oS4.client +
                "&sap-language=" + oS4.language +
                "#SalesOrder-display?SalesOrder=" + encodeURIComponent(oData.salesDoc);

            window.open(sUrl, "_blank");
        },


        _openVA43: function () {
            var oContext = this.getView().getBindingContext();

            if (!oContext) {
                console.error("VA43: Binding context not available.");
                return;
            }

            var oData = oContext.getObject();
            var oS4 = this._getS4Config();

            if (!oData.qt_salesDoc) {
                console.error("VA43: qt_salesDoc is empty.");
                return;
            }

            var sUrl = oS4.host +
                "/sap/bc/ui2/flp?sap-client=" + oS4.client +
                "&sap-language=" + oS4.language +
                "#SalesQuotation-display?SalesQuotation=" + encodeURIComponent(oData.qt_salesDoc);

            window.open(sUrl, "_blank");
        },


        onSalesOrderLinkPress: function () {
            this._openVA03();
        },


        onQuotationLinkPress: function () {
            this._openVA43();
        },


        _refreshMatchModel: function () {
            var oContext = this.getView().getBindingContext();

            if (!oContext) {
                return;
            }

            var oData = oContext.getObject();

            if (!oData || (!oData.salesDoc && !oData.qt_salesDoc)) {
                return;
            }

            this._oLastDocs = { so: oData.salesDoc || "", qt: oData.qt_salesDoc || "" };
            this._processData(oData);
        },


        _processData: function (oData) {
            var oView = this.getView();

            var oMatchModel = new JSONModel({
                soldToState: formatter.getMatchState(
                    oData.customerIdName,
                    oData.qt_CustomerIdName
                ),
                // change#shiptoscore
                shipToState: formatter.getShipToState(
                    oData.adrc_score,
                    oData.so_shipToIdAddress,
                    oData.qt_shipToIdAddress
                ),
                paymentTermState: formatter.getMatchState(
                    oData.so_paymentTermDescp,
                    oData.qt_paymentTermDescp
                ),
                incoTermState: formatter.getMatchState(
                    oData.so_incoTermDescp,
                    oData.qt_incoTermDescp
                ),
                salesResponsibleState: formatter.getMatchState(
                    oData.so_salesResponsibleIdName,
                    oData.qt_salesResponsibleIdName
                ),
                currencyState: formatter.getMatchState(
                    oData.so_currency,
                    oData.qt_currency
                ),

                // change#newfieldblue
                shippingConditionState: formatter.getMatchState(
                    oData.so_shippingCondtIdName,
                    oData.qt_shippingCondtIdName
                ),

                customerReferenceState: formatter.getMatchState(
                    oData.customerReference,
                    oData.qt_customerReference
                ),

                pricingPartnerState: formatter.getMatchState(
                    oData.pricingPartnerIdName,
                    oData.qt_pricingPartnerIdName
                ),

                objectPartnerState: formatter.getMatchState(
                    oData.objectPartnerIdName,
                    oData.qt_objectPartnerIdName
                ),

                    // currency is no longer a separate row: a currency mismatch must still turn Total Value red
                totalValueState: (formatter.getMatchState(oData.so_currency, oData.qt_currency) === "Error")
                    ? "Error"
                    : formatter.getMatchState(
                        oData.so_total_value,
                        oData.qt_total_value,
                        true
                    ),
                valueWithoutTaxState: formatter.getMatchState(
                    oData.so_netValue,
                    oData.qt_netValue,
                    true
                ),
                taxValueState: formatter.getMatchState(
                    oData.so_tax_value,
                    oData.qt_tax_value,
                    true
                )
            });

            if (!oView.getModel("match")) {
                oView.setModel(oMatchModel, "match");
            } else {
                oView.getModel("match").setData(oMatchModel.getData());
            }
        },

        //this opens after user press the button
        onLinkDocsPress: function () {
            this._openConfirmLinkDialog([
                "paymentTerms",
                "pricingPartner",
                "salesResponsible",
                "objectPartner",
                "refCustomer"
            ]);
        },


        _ensureDialogStyles: function () {
            var oOld = document.getElementById("clDialogStyles");

            if (oOld && oOld.parentNode) {
                oOld.parentNode.removeChild(oOld);
            }

            var sCss = [
                ".linkDocsSelectionDialog .sapMDialogScrollCont{background:#fff;}",
                ".confirmLinkContent{padding:4px 18px 16px 18px !important;}",
                ".confirmSectionTitle,.confirmSectionTitle .sapMTitle{text-transform:uppercase !important;font-weight:700 !important;font-size:0.8125rem !important;letter-spacing:0.6px;color:#1d5fd1 !important;}",
                ".confirmSectionTitle{padding-bottom:6px;margin-bottom:4px !important;border-bottom:2px solid #1d5fd1;}",
                ".clSelectAllRow{width:100%;margin-bottom:4px;padding:2px 4px;}",
                ".clRow{width:100% !important;box-sizing:border-box;min-height:52px;padding:6px 4px;border-bottom:1px solid #eeeeee;}",
                ".clFieldLabel{font-weight:700 !important;color:#334155 !important;}",
                ".clOldValue{color:#d92d20 !important;text-decoration:line-through !important;}",
                ".clNewValue{color:#166534 !important;font-weight:700 !important;}",
                ".clValueNeutral{color:#5b6b82 !important;font-weight:600 !important;}",
                ".clArrow{color:#7c9bc4 !important;margin:0 12px !important;}",
                ".clTag{margin-left:14px !important;}",
                ".clCheckBox{margin-left:16px !important;}",
                ".clLineNo{color:#7890ad !important;font-weight:600 !important;}",
                ".clLineMaterial{color:#536b8c !important;font-weight:600 !important;}",
                ".clLineField{font-weight:700 !important;color:#1f2937 !important;}",
                ".clSummaryBox{background:#f5f8fd;border:1px solid #d6e4ff;border-radius:8px;padding:10px 16px;margin-top:12px;width:100%;box-sizing:border-box;}",
                ".clSummaryTitle{font-weight:700 !important;color:#1f2937 !important;margin-bottom:4px;}",
                ".clSummaryLine{color:#334155 !important;}",
                ".clSummaryTotal{font-weight:700 !important;color:#1d5fd1 !important;}",
                ".clMatchCard{width:100%;box-sizing:border-box;margin:8px 0 4px 0;padding:14px 18px;background:#eef8ef;border:1px solid #cfe8d2;border-left:4px solid #2e7d32;border-radius:8px;}",
                ".clMatchIcon{flex:none;display:inline-flex !important;align-items:center;justify-content:center;width:2.25rem !important;height:2.25rem !important;margin-right:14px;border-radius:50%;background:#2e7d32;color:#ffffff !important;font-size:1.125rem !important;}",
                ".clMatchTitle{display:block;font-weight:700 !important;font-size:0.9375rem !important;color:#166534 !important;}",
                ".clMatchSub{display:block;font-size:0.8125rem !important;color:#4b5563 !important;margin-top:2px;}",
                ".clLineRow .clLineNo,.clLineRow .clLineMaterial,.clLineRow .clLineField,.clLineRow .clOldValue,.clLineRow .clNewValue,.clLineRow .clValueNeutral{white-space:nowrap !important;word-break:normal !important;overflow-wrap:normal !important;}",
                ".clLineRow .clArrow{margin:0 8px !important;}",
                ".clLineRow .clTag{margin-left:12px !important;white-space:nowrap !important;}"
            ].join("\n");

            var oStyle = document.createElement("style");
            oStyle.id = "clDialogStyles";
            oStyle.appendChild(document.createTextNode(sCss));
            document.head.appendChild(oStyle);
        },


        _openConfirmLinkDialog: function (aSelectedFields) {
            var that = this;

            this._ensureDialogStyles();

            if (this._oConfirmLinkDialog) {
                this._oConfirmLinkDialog.destroy();
                this._oConfirmLinkDialog = null;
            }

            this._mLinkDocCheckboxes = {};
            this._aLineRows = [];
            this._iHeaderRows = 0;
            this._iLineRows = 0;
            this._iLineChanged = 0;
            this._bLinesLoading = true;

            Fragment.load({
                id: this.getView().getId(),
                name: "com.bmi.orderquotematch.project1.ext.Objectpage.ConfirmLinkDialog",
                controller: this
            }).then(function (oDialog) {
                that._oConfirmLinkDialog = oDialog;
                that.getView().addDependent(oDialog);

                that._fillConfirmHeaderFields(oDialog, aSelectedFields);
                that._refreshSelectAllRow();

                that._toggleSection("lineItemsTitle", "lineItemsContainer", false);
                that._updateSelectionState();

                // Show loading immediately
                oDialog.setBusyIndicatorDelay(0);
                oDialog.setBusy(true);

                oDialog.open();

                that._readLineItems().then(function (aItems) {

                    console.log("LINE ITEMS RETURNED", aItems);

                    if (that._oConfirmLinkDialog !== oDialog) {
                        return;
                    }

                    that._fillConfirmLineItems(aItems);
                    that._bLinesLoading = false;

                    // Hide loading after line items are loaded
                    oDialog.setBusy(false);

                     console.log("SETTING LOADING FALSE");

                    that._updateNoChangesText();
                    that._updateSelectionState();
                });
            });
        },


        _byFragId: function (sId) {
            return sap.ui.core.Fragment.byId(this.getView().getId(), sId);
        },


        _createArrow: function () {
            var oArrow = new sap.ui.core.Icon({ src: "sap-icon://arrow-right" });
            oArrow.addStyleClass("clArrow");
            return oArrow;
        },


        _createFieldCheckBox: function (fnRegister) {
            var oCheckBox = new sap.m.CheckBox({
                selected: true,
                select: this._onFieldCheckBoxSelect.bind(this)
            });

            oCheckBox.addStyleClass("clCheckBox");
            fnRegister(oCheckBox);
            return oCheckBox;
        },


        _createLockedCheckBox: function () {
            var oCheckBox = new sap.m.CheckBox({
                selected: true,
                enabled: false
            });

            oCheckBox.addStyleClass("clCheckBox clCheckBoxLocked");
            return oCheckBox;
        },


        _pick: function (oObj, aKeys) {
            if (!oObj) {
                return undefined;
            }

            var mLower = {};

            Object.keys(oObj).forEach(function (sKey) {
                mLower[sKey.toLowerCase()] = sKey;
            });

            for (var i = 0; i < aKeys.length; i++) {
                var sReal = mLower[String(aKeys[i]).toLowerCase()];

                if (sReal === undefined) {
                    continue;
                }

                var vValue = oObj[sReal];

                if (vValue !== undefined && vValue !== null && String(vValue).trim() !== "") {
                    return vValue;
                }
            }

            return undefined;
        },


        _fillConfirmHeaderFields: function (oDialog, aSelectedFields) {
            var oContext = this.getView().getBindingContext();

            if (!oContext) {
                return;
            }

            var oData = oContext.getObject();
            var oContainer = this._byFragId("headerFieldsContainer");

            if (!oContainer) {
                return;
            }

            oContainer.removeAllItems();

            var that = this;

            var oFields = {
                paymentTerms: {
                    label: that._getText("fieldPaymentTerms"),
                    tooltip: that._getText("fieldPaymentTermsTooltip"),
                    oldValue: that._pick(oData, ["so_paymentTerm"]),
                    newValue: that._pick(oData, ["qt_paymentTerm"])
                },
                pricingPartner: {
                    label: that._getText("fieldPricingPartner"),
                    tooltip: that._getText("fieldPricingPartnerTooltip"),
                    oldValue: that._pick(oData, ["pricingPartner"]),
                    newValue: that._pick(oData, ["qt_pricingPartner"])
                },
                salesResponsible: {
                    label: that._getText("fieldSalesRep"),
                    tooltip: that._getText("fieldSalesRepTooltip"),
                    oldValue: that._pick(oData, ["so_salesResponsibleIdName"]),
                    newValue: that._pick(oData, ["qt_salesResponsibleIdName"])
                },
                objectPartner: {
                    label: that._getText("fieldObjectPartner"),
                    tooltip: that._getText("fieldObjectPartnerTooltip"),
                    oldValue: that._pick(oData, ["objectPartner"]),
                    newValue: that._pick(oData, ["qt_objectPartner"])
                },
                refCustomer: {
                    label: that._getText("fieldRefCustomer"),
                    tooltip: that._getText("fieldRefCustomerTooltip"),
                    oldValue: that._pick(oData, ["so_ref_customerIdName"]),
                    newValue: that._pick(oData, ["qt_ref_customerIdName"])
                }
            };

            var iRows = 0;

            aSelectedFields.forEach(function (sKey) {
                var oField = oFields[sKey];

                if (!oField) {
                    return;
                }

                if (!that._isDifferent(oField.oldValue, oField.newValue)) {
                    return;
                }

                iRows++;

                var oLabel = new sap.m.Text({
                    text: oField.label,
                    tooltip: oField.tooltip
                });
                oLabel.addStyleClass("clFieldLabel");

                var oLabelBox = new sap.m.HBox({
                    alignItems: "Center",
                    items: [oLabel],
                    layoutData: new FlexItemData({ baseSize: "260px", growFactor: 0, shrinkFactor: 0 })
                });
                oLabelBox.addStyleClass("clLabelBox");

                var oOldValue = new sap.m.Text({ text: that._displayValue(oField.oldValue) });
                oOldValue.addStyleClass("clOldValue");

                var oNewValue = new sap.m.Text({ text: that._displayValue(oField.newValue) });
                oNewValue.addStyleClass("clNewValue");

                var oValueBox = new sap.m.HBox({
                    alignItems: "Center",
                    items: [oOldValue, that._createArrow(), oNewValue],
                    layoutData: new FlexItemData({ growFactor: 1, shrinkFactor: 1 })
                });
                oValueBox.addStyleClass("clValueBox");

                var oCheckBox = that._createFieldCheckBox(function (oCb) {
                    that._mLinkDocCheckboxes[sKey] = oCb;
                });

                var oRow = new sap.m.HBox({
                    alignItems: "Center",
                    width: "100%",
                    items: [oLabelBox, oValueBox, oCheckBox]
                });
                oRow.addStyleClass("clRow clHeaderRow");

                oContainer.addItem(oRow);
            });

            if (iRows === 0) {
                var oMatchIcon = new sap.ui.core.Icon({ src: "sap-icon://accept" });
                oMatchIcon.addStyleClass("clMatchIcon");

                var oMatchTitle = new sap.m.Text({ text: that._getText("allHeaderFieldsMatch") });
                oMatchTitle.addStyleClass("clMatchTitle");

                var oMatchSub = new sap.m.Text({ text: that._getText("noHeaderChanges") });
                oMatchSub.addStyleClass("clMatchSub");

                var oMatchCard = new sap.m.HBox({
                    alignItems: "Center",
                    width: "100%",
                    items: [
                        oMatchIcon,
                        new sap.m.VBox({ items: [oMatchTitle, oMatchSub] })
                    ]
                });
                oMatchCard.addStyleClass("clMatchCard");

                oContainer.addItem(oMatchCard);
            }

            this._iHeaderRows = iRows;
            this._toggleSection("headerFieldsTitle", "headerFieldsContainer", true);
        },


        _readLineItems: function () {
            var oView = this.getView();
            var oContext = oView.getBindingContext();
            var oModel = oView.getModel();

            if (!oContext) {
                return Promise.resolve([]);
            }

            var oHeaderData = oContext.getObject();

            var aFallback = (oHeaderData && (oHeaderData.item || oHeaderData.material))
                ? [oHeaderData]
                : [];

            return new Promise(function (resolve) {
                oModel.read(oContext.getPath() + "/to_ZI_QTO_SO_QT_MATCHED", {
                    success: function (oResponse) {
                        var aResults = (oResponse && oResponse.results) || [];
                        resolve(aResults.length > 0 ? aResults : aFallback);
                    },
                    error: function (oError) {
                        console.error("Line items read failed", oError);
                        resolve(aFallback);
                    }
                });
            });
        },


        _fillConfirmLineItems: function (aItems) {
            var oContainer = this._byFragId("lineItemsContainer");

            if (!oContainer) {
                return;
            }

            oContainer.removeAllItems();

            var that = this;

            this._aLineRows = [];
            this._iLineChanged = 0;

            // var aRows = (aItems || []).filter(function (oRow) {
            //     return that._pick(oRow, ["item"]) !== undefined ||
            //         that._pick(oRow, ["material"]) !== undefined;
            // });

            //change#nearmiss //Near-miss rows excluded from Link Docs popup.
           var aRows = (aItems || []).filter(function (oRow) {

             var vVariance = that._pick(oRow, ["variance"]);

            console.log("item =", oRow.item, "| variance =", vVariance);

            return (
                (that._pick(oRow, ["item"]) !== undefined ||
                that._pick(oRow, ["material"]) !== undefined)
                &&
                vVariance !== undefined &&
                vVariance !== null &&
                Number(vVariance) === 0
            );

        });


            aRows.sort(function (a, b) {
                return Number(that._pick(a, ["item"])) - Number(that._pick(b, ["item"]));
            });

            aRows.forEach(function (oRow) {
                var sItem = that._pick(oRow, ["item"]);
                var sMaterial = that._pick(oRow, ["material"]);
                var vSoPrice = that._pick(oRow, ["so_unit_Price"]);
                var vQtPrice = that._pick(oRow, ["qt_unit_Price"]);

                var bDifferent = that._isDifferent(vSoPrice, vQtPrice);

                if (bDifferent) {
                    that._iLineChanged++;
                }

                that._aLineRows.push(oRow);

                var oNo = new sap.m.Text({
                    text: sItem !== undefined
                        ? "#" + (String(sItem).replace(/^0+/, "") || String(sItem))
                        : "-",
                    layoutData: new FlexItemData({ baseSize: "60px", growFactor: 0, shrinkFactor: 0 })
                });
                oNo.addStyleClass("clLineNo");

                var oMaterial = new sap.m.Text({
                    text: that._displayValue(sMaterial),
                    layoutData: new FlexItemData({ baseSize: "120px", growFactor: 0, shrinkFactor: 1 })
                });
                oMaterial.addStyleClass("clLineMaterial");

                var oField = new sap.m.Text({
                    text: that._getText("fieldUnitPrice"),
                    layoutData: new FlexItemData({ baseSize: "110px", growFactor: 0, shrinkFactor: 1 })
                });
                oField.addStyleClass("clLineField");

                var oOldValue = new sap.m.Text({
                    text: that._displayValue(formatter.formatPriceCur(vSoPrice, ""))
                });
                oOldValue.addStyleClass(bDifferent ? "clOldValue" : "clValueNeutral");

                var oNewValue = new sap.m.Text({
                    text: that._displayValue(formatter.formatPriceCur(vQtPrice, ""))
                });
                oNewValue.addStyleClass(bDifferent ? "clNewValue" : "clValueNeutral");

                //change updated -> update
                var oTag = new sap.m.ObjectStatus({
                    text: that._getText(bDifferent ? "tagUpdate" : "tagNoChange"),
                    state: bDifferent ? "Success" : "None",
                    inverted: true
                });
                oTag.addStyleClass("clTag");

                var oValueBox = new sap.m.HBox({
                    alignItems: "Center",
                    items: [oOldValue, that._createArrow(), oNewValue, oTag],
                    layoutData: new FlexItemData({ growFactor: 1, shrinkFactor: 0 })
                });
                oValueBox.addStyleClass("clValueBox");

                // var oRowBox = new sap.m.HBox({
                //     alignItems: "Center",
                //     width: "100%",
                //     items: [oNo, oMaterial, oField, oValueBox, that._createLockedCheckBox()]
                // });
                // oRowBox.addStyleClass("clRow clLineRow");

                // oContainer.addItem(oRowBox);

                  //change#nearmiss
                    var oRowBox = new sap.m.HBox({
                        alignItems: "Center",
                        width: "100%",
                        items: [
                            oNo,
                            oMaterial,
                            oField,
                            oValueBox,
                           // that._createLockedCheckBox()
                        ]
                    });

                    oRowBox.addStyleClass("clRow clLineRow");

                oContainer.addItem(oRowBox);
            });

            this._iLineRows = this._aLineRows.length;
            this._toggleSection("lineItemsTitle", "lineItemsContainer", this._iLineRows > 0);
        },


        _updateNoChangesText: function () {
            var oNoChanges = this._byFragId("noChangesText");

            if (oNoChanges) {
                oNoChanges.setVisible(!this._iHeaderRows && !this._iLineRows);
            }
        },


        _getAllFieldCheckBoxes: function () {
            var mCb = this._mLinkDocCheckboxes || {};

            return Object.keys(mCb).map(function (sKey) {
                return mCb[sKey];
            });
        },


        _refreshSelectAllRow: function () {
            var oRow = this._byFragId("selectAllRow");
            var oSelectAll = this._byFragId("selectAllCheckBox");
            var aAll = this._getAllFieldCheckBoxes();

            if (oRow) {
                oRow.setVisible(aAll.length > 0);
            }

            if (oSelectAll) {
                oSelectAll.setSelected(aAll.length > 0 && aAll.every(function (oCb) {
                    return oCb.getSelected();
                }));
            }
        },


        onSelectAllChange: function (oEvent) {
            var bSelected = oEvent.getParameter("selected");

            this._getAllFieldCheckBoxes().forEach(function (oCb) {
                oCb.setSelected(bSelected);
            });

            this._updateSelectionState();
        },


        _onFieldCheckBoxSelect: function () {
            var oSelectAll = this._byFragId("selectAllCheckBx");
            var aAll = this._getAllFieldCheckBoxes();

            if (oSelectAll) {
                oSelectAll.setSelected(aAll.length > 0 && aAll.every(function (oCb) {
                    return oCb.getSelected();
                }));
            }

            this._updateSelectionState();
        },


        _getSelectedHeaderCount: function () {
            return this._getAllFieldCheckBoxes().filter(function (oCb) {
                return oCb.getSelected();
            }).length;
        },


        _updateSelectionState: function () {
            var iHeader = this._getSelectedHeaderCount();
            var iLine = this._iLineChanged || 0;
            var iTotal = iHeader + iLine;

            var bNothingToChange = !this._iHeaderRows && !iLine;

            var oButton = this._byFragId("linkDocumentsButton");
            var oSummary = this._byFragId("summaryBox");

            var oHeaderText = this._byFragId("summaryHeaderText");
            var oLineText = this._byFragId("summaryLineText");
            var oTotalText = this._byFragId("summaryTotalText");

            if (oHeaderText) {
                oHeaderText.setText(this._getText("summaryHeaderFields", [iHeader]));
            }

            if (oLineText) {
                oLineText.setText(this._getText("summaryLineFields", [iLine]));
            }

            if (oTotalText) {
                oTotalText.setText(this._getText("summaryTotalSelected", [iTotal]));
            }

            if (oSummary) {
                oSummary.setVisible(!bNothingToChange && !this._bLinesLoading);
            }

            if (!oButton) {
                return;
            }

            if (this._bLinesLoading) {
                oButton.setText(this._getText("linkDocuments"));
                oButton.setEnabled(false);
                return;
            }

            if (bNothingToChange) {
                oButton.setText(this._getText("linkDocuments"));
                oButton.setEnabled(true);
                return;
            }

             //change#3
            oButton.setText(this._getText("linkDocumentsCount", [iTotal]));
            oButton.setEnabled(true);
        },


        _isEmpty: function (vValue) {
            return vValue === undefined || vValue === null || String(vValue).trim() === "";
        },


        _isDifferent: function (vOld, vNew) {
            if (this._isEmpty(vOld) && this._isEmpty(vNew)) {
                return false;
            }

            if (!this._isEmpty(vOld) && !this._isEmpty(vNew)) {
                var nOld = Number(String(vOld).replace(/,/g, ""));
                var nNew = Number(String(vNew).replace(/,/g, ""));

                if (!isNaN(nOld) && !isNaN(nNew)) {
                    return nOld !== nNew;
                }
            }

            return String(vOld).trim().toLowerCase() !== String(vNew).trim().toLowerCase();
        },


        _toggleSection: function (sTitleId, sContainerId, bVisible) {
            var oTitle = this._byFragId(sTitleId);
            var oContainer = this._byFragId(sContainerId);

            if (oTitle) {
                oTitle.setVisible(bVisible);
            }

            if (oContainer) {
                oContainer.setVisible(bVisible);
            }
        },


        _displayValue: function (vValue) {
            if (vValue === undefined || vValue === null || vValue === "") {
                return "-";
            }

            return String(vValue);
        },


        onCloseConfirmDialog: function () {
            if (this._oConfirmLinkDialog) {
                this._oConfirmLinkDialog.close();
            }
        },


        _getBackendErrorMessage: function (oError) {
            var sMessage = "";

            try {
                var oBody = JSON.parse(oError.responseText);
                var vMsg = oBody && oBody.error && oBody.error.message;

                sMessage = vMsg && (vMsg.value || (typeof vMsg === "string" ? vMsg : ""));
            } catch (e) {
                // fall through
            }

            if (!sMessage) {
                var aMessages = sap.ui.getCore()
                    .getMessageManager()
                    .getMessageModel()
                    .getData();

                if (aMessages.length > 0) {
                    sMessage = aMessages[0].message;
                }
            }

            return sMessage || this._getText("linkFailed");
        },


        onConfirmLinkDocuments: function () {
            var that = this;
            var oModel = this.getView().getModel();
            var oContext = this.getView().getBindingContext();
            var oData = oContext.getObject();

            var mCb = this._mLinkDocCheckboxes || {};

            var fnChecked = function (sKey) {
                return mCb[sKey] ? mCb[sKey].getSelected() : false;
            };

            var bLinePrice = (this._aLineRows || []).length > 0;

            this._oConfirmLinkDialog.setBusy(true);

            oModel.callFunction("/Linkdocs", {
                method: "POST",
                urlParameters: {
                    salesDoc: oData.salesDoc,
                    qt_salesDoc: oData.qt_salesDoc,
                    item: oData.item,
                    qt_item: oData.qt_item,
                    material: oData.material,

                    payment_terms: fnChecked("paymentTerms"),
                    Pricing_partner: fnChecked("pricingPartner"),
                    Sales_representative: fnChecked("salesResponsible"),
                    Object_partner: fnChecked("objectPartner"),
                    Ref_customer: fnChecked("refCustomer"),

                    Line_material: false,
                    Line_description: false,
                    Line_quantity: false,
                    Line_unit_price: bLinePrice
                },

                success: function () {
                    console.log("LINKDOCS SUCCESS CALLBACK HIT");

                    var aMessages = sap.ui.getCore()
                        .getMessageManager()
                        .getMessageModel()
                        .getData();

                    var sMessage = aMessages.length > 0
                        ? aMessages[0].message
                        : that._getText("linkSuccess");

                    if (that._oConfirmLinkDialog) {
                        that._oConfirmLinkDialog.setBusy(false);
                        that._oConfirmLinkDialog.close();
                    }

                    MessageBox.information(sMessage, {
                        title: that._getText("information"),
                        actions: [that._getText("continue")],
                        onClose: function () {
                            console.log("REFRESH FLAG SET FROM LINKDOCS");

                            that._requestListRefresh();

                            console.log("CALLING HISTORY.BACK FROM LINKDOCS");

                            that._navigateToList();
                            // window.location.reload() removed to prevent slow app reloads
                        }
                    });
                },

                error: function (oError) {
                    console.error("ERROR", oError);

                    if (that._oConfirmLinkDialog) {
                        that._oConfirmLinkDialog.setBusy(false);
                    }

                    MessageBox.error(that._getBackendErrorMessage(oError));
                }
            });
        },

        onAfterRendering: function () {
            console.log("HIDING SPINNER");
            BusyIndicator.hide();

            this._refreshMatchModel();
            this._loadUnmatchedPairs();   // change#um-pair

            setTimeout(function () {
                var oTitleButton = document.getElementById("shellAppTitle-button");

                if (oTitleButton) {
                    oTitleButton.style.display = "none";
                }
            }, 1000);

            // change#mousehorizontalscroll
        document.querySelectorAll(".comparisonGrid").forEach(function (oGrid) {
            oGrid.addEventListener("wheel", function (e) {
                if (oGrid.scrollWidth > oGrid.clientWidth) {
                    e.preventDefault();
                    oGrid.scrollLeft += e.deltaY;
                }
            }, { passive: false });
        });

        

        },


        /* ========================================================= */
        /* RETURN TO LIST (no page reload -> filters are kept)       */
        /* ========================================================= */

        // Tells the List Report to refresh its data in place.
        // The sessionStorage flag is only a fallback in case the List Report
        // was re-created and therefore missed the event.
        // bFull === false -> light refresh (no confidence process). Any other value -> full refresh.
        _requestListRefresh: function (bFull) {
            var bNewFull = bFull !== false;
            var iNow = Date.now();

            // one user action must cause ONE list refresh: skip a repeated request that comes
            // right after the previous one, unless it is a full refresh following a light one
            if (this._iLastRefreshAt && (iNow - this._iLastRefreshAt) < 2000 &&
                (!bNewFull || this._bLastRefreshFull)) {
                console.log("List refresh request skipped (already requested)");
                return;
            }
            this._iLastRefreshAt = iNow;
            this._bLastRefreshFull = bNewFull;

            try { sessionStorage.setItem("RefreshAfterAction", "X"); } catch (e) { /* ignore */ }
            sap.ui.getCore().getEventBus().publish("OrderLink", "listNeedsRefresh", { full: bNewFull });
        },

        // Runs fnDone once the running OData batch (the action) has finished.
        // iMaxWait is only a safety net if no batch completion is reported.
        _whenActionDone: function (fnDone, iMaxWait) {
            var oModel = this.getOwnerComponent().getModel();
            var bDone = false;

            function proceed(oEvent) {
                if (bDone) { return; }
                bDone = true;
                if (oModel && oModel.detachBatchRequestCompleted) {
                    oModel.detachBatchRequestCompleted(proceed);
                }
                var bSuccess;   // undefined when only the safety timeout ended the wait
                if (oEvent && oEvent.getParameters) {
                    console.log("ACTION DONE, batch params:", oEvent.getParameters());
                    bSuccess = oEvent.getParameter("success");
                }
                fnDone(bSuccess);
            }

            if (oModel && oModel.attachBatchRequestCompleted) {
                oModel.attachBatchRequestCompleted(proceed);
                setTimeout(proceed, iMaxWait || 8000);
            } else {
                proceed();
            }
        },

        // Wait for the action to finish, refresh the list, go back ONCE
        _returnToList: function (bFull, bNoMessage) {
            var that = this;
            if (this._bReturning) { return; }
            this._bReturning = true;

            this._whenActionDone(function (bSuccess) {
                that._bReturning = false;
                if (bFull && bSuccess !== false && !bNoMessage) {
                    that._showActionMessage("reset");   // Reset = the only caller with bFull === true
                }
                that._requestListRefresh(bFull);
                that._navigateToList();
            });
        },

        // After Reset the user STAYS on the entry (no jump back to the list), so a wrongly rejected entry can be
        // reset and linked straight away. Wait for the action, show the banner, refresh this entry so the new
        // status / buttons are shown, and refresh the list in the background so it is up to date when the user
        // goes back.
        _afterReset: function () {
            var that = this;
            if (this._bResetting) { return; }
            this._bResetting = true;

            this._whenActionDone(function (bSuccess) {
                that._bResetting = false;
                if (bSuccess === false) { return; }   // action failed -> nothing to refresh

                // no banner here: the user stays on the entry and sees the new status directly
                that._requestListRefresh(true);       // list is refreshed in place, no navigation
                that._refreshCurrentEntry();
            });
        },

        // change#um-pair : builds ONE row per item number for the Unmatched card
        // (Sales Order item left | Quote item right) into the JSON model "um" (/rows).
        // The two unmatched lists are separate navigations, so they are read here and merged.
        _loadUnmatchedPairs: function (bForce) {
            var oView = this.getView();
            var oCtx = oView.getBindingContext();
            var oModel = oView.getModel();
            if (!oCtx || !oModel) { return; }

            var sPath = oCtx.getPath();
            if (!bForce && this._sUmPath === sPath) { return; }
            this._sUmPath = sPath;

            var fnRead = function (sNav) {
                return new Promise(function (resolve) {
                    oModel.read(sPath + "/" + sNav, {
                        success: function (oRes) { resolve((oRes && oRes.results) || []); },
                        error: function () { resolve([]); }
                    });
                });
            };
            var fnNum = function (s) { var n = parseInt(s, 10); return isNaN(n) ? 0 : n; };

            Promise.all([
                fnRead("to_ZI_QTO_FILTER_SO_UNMATCH"),
                fnRead("to_ZI_QTO_FILTER_QT_UNMATCH")
            ]).then(function (a) {
                var mRows = {};
                var fnAdd = function (o, sSide) {
                    var k = String(fnNum(o.item));
                    var n = 0;
                    // same item number twice on one side -> own row
                    while (mRows[k] && mRows[k][sSide]) { k = fnNum(o.item) + "#" + (++n); }
                    mRows[k] = mRows[k] || { item: o.item };
                    mRows[k][sSide] = o;
                };
                a[0].forEach(function (o) { fnAdd(o, "so"); });
                a[1].forEach(function (o) { fnAdd(o, "qt"); });

                var aRows = Object.keys(mRows)
                    .map(function (k) { return mRows[k]; })
                    .sort(function (x, y) { return fnNum(x.item) - fnNum(y.item); });

                var oUm = oView.getModel("um");
                if (oUm) {
                    oUm.setData({ rows: aRows });
                } else {
                    oView.setModel(new JSONModel({ rows: aRows }), "um");
                }
            });
        },

        // Re-reads the entry that is open, so the status and the Reject Link button are up to date
        _refreshCurrentEntry: function () {
            var that = this;
            try {
                var oBinding = this.getView().getElementBinding();
                if (oBinding && oBinding.refresh) {
                    oBinding.refresh(true);
                } else {
                    var oModel = this.getView().getModel();
                    if (oModel && oModel.refresh) { oModel.refresh(true); }
                }
            } catch (e) { /* ignore */ }

            // the Reject button state is re-checked once the refreshed data has arrived
            setTimeout(function () {
                that._updateRejectButtonState();
                that._loadUnmatchedPairs(true);   // change#um-pair
            }, 800);
        },

        // Clears the Fiori Launchpad "unsaved data" flag so the browser does not ask
        // "This page contains unsaved data. Are you sure you want to leave the page?"
        // (this page only runs actions, there is nothing for the user to save)
        _clearDirtyFlag: function () {
            try {
                if (sap.ushell && sap.ushell.Container && sap.ushell.Container.setDirtyFlag) {
                    sap.ushell.Container.setDirtyFlag(false);
                }
            } catch (e) { /* ignore */ }
        },

        // Goes back exactly once. NEVER reloads the page.
        _navigateToList: function () {
            var that = this;
            var sIntent = (window.location.hash || "").split("&/")[0];

            console.log("Navigate to list, intent:", sIntent);

            this._clearDirtyFlag();

            // If the browser/launchpad still asks "unsaved data ... leave the page?" during OUR OWN
            // programmatic back navigation, answer it automatically. Other confirms are not touched,
            // and the original window.confirm is restored after 3 seconds.
            if (!this._fnOrigConfirm) {
                this._fnOrigConfirm = window.confirm;
                var that0 = this;
                window.confirm = function (sMsg) {
                    if (/unsaved/i.test(String(sMsg || ""))) { return true; }
                    return that0._fnOrigConfirm.apply(window, arguments);
                };
                setTimeout(function () {
                    window.confirm = that0._fnOrigConfirm;
                    that0._fnOrigConfirm = null;
                }, 3000);
            }

            // lets the popstate handler ignore our own history.go(-1)
            // (history.go(-1) can fire more than one popstate -> ignore all of them for a short time)
            this._bNavigatingBack = true;
            this._iIgnorePopstateUntil = Date.now() + 1500;
            window.history.go(-1);

            // failsafe WITHOUT reload: still on the object page -> change the hash only.
            // Only the URL hash is checked (it changes immediately when going back), NOT the
            // visibility of the Return button, which can still be visible while BU4 is rendering
            // the list and would wrongly re-navigate and refresh page 1 a second time.
            setTimeout(function () {
                var bOnObjectPageHash = /&\/ZC_QTO_SO_QT\(/.test(window.location.hash || "");

                if (bOnObjectPageHash && sIntent && sIntent !== "#") {
                    console.log("Still on object page, switching hash (no reload):", sIntent);
                    that._bNavigatingBack = true;
                    window.location.hash = sIntent;
                }

                setTimeout(function () { that._bNavigatingBack = false; }, 500);
            }, 3000);
        },

        //executing return to list
        _executeReturnToList: function () {
            console.log("_executeReturnToList CALLED");

            var sId = document.querySelector('[id*="Return_to_list"]')?.id;

            if (!sId) {
                return;
            }

            if (this._browserBackNavigation) {
                this._requestListRefresh();
                this._browserBackNavigation = false;
            }


            var oControl = sap.ui.getCore().byId(sId);

            if (oControl && oControl.firePress) {
                oControl.firePress();
            }
        },


        _getS4Config: function () {
            var sHost = window.location.hostname;

            var sLanguage = sap.ui.getCore()
                .getConfiguration()
                .getLanguage()
                .toUpperCase();

            if (sHost.includes("applicationstudio") || sHost.includes("dev")) {
                return {
                    host: "https://go-s4-dev.sap.bmigroup.com",
                    client: "310",
                    language: sLanguage
                };
            }

            if (sHost.includes("bu4")) {
                return {
                    host: "https://go-s4-bu4.sap.bmigroup.com",
                    client: "400",
                    language: sLanguage
                };
            }

            return {
                host: "https://go-s4.sap.bmigroup.com",
                client: "400",
                language: sLanguage
            };
        },


        onEditLineMatch: function (oEvent) {
            var oRow = oEvent.getSource().getBindingContext().getObject();
            MessageToast.show(this._getText("editLineItemTodo"));
        },


        onExit: function () {
            this._browserBackHandled = false;
            try {
                var oSharedModel = this.getOwnerComponent && this.getOwnerComponent() && this.getOwnerComponent().getModel();
                if (oSharedModel) {
                    if (this._fnOnRequestCompleted) { oSharedModel.detachRequestCompleted(this._fnOnRequestCompleted); }
                    if (this._fnOnRequestFailed) { oSharedModel.detachRequestFailed(this._fnOnRequestFailed); }
                }
            } catch (e) { /* ignore */ }
            window.removeEventListener("popstate", this._onBrowserBack);
            window.removeEventListener("resize", this._onResizePin);
            document.removeEventListener("click", this._onDocClick);
            if (this._fnBlockRejected) {
                document.removeEventListener("click", this._fnBlockRejected, true);
                document.removeEventListener("keydown", this._fnBlockRejected, true);
                document.removeEventListener("keyup", this._fnBlockRejected, true);
            }
            document.body.classList.remove("hideAppTitleArrow");
        }
    };
});