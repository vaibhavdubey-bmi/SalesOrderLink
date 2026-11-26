sap.ui.define([
    "sap/ui/core/format/DateFormat",
    "sap/ui/core/format/NumberFormat"
], function (DateFormat, NumberFormat) {
    "use strict";

    function normalize(value) {
        if (value === null || value === undefined) {
            return "";
        }

        return String(value)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    }

    function toNumber(value) {
        if (value === null || value === undefined) {
            return NaN;
        }

        var s = String(value)
            .replace(/[\s\u00A0]/g, "")
            .replace(/,/g, "");

        if (s === "" || s === "-") {
            return NaN;
        }

        return Number(s);
    }

    function sameNum(a, b) {
        return Math.abs(a - b) < 1e-9;
    }

    var oFormatter = {

        getMatchState: function (value1, value2, bAllowPossible) {
            var v1 = normalize(value1);
            var v2 = normalize(value2);

            /*
             * Both values are empty / not maintained
             * -> Information
             */
            if (!v1 && !v2) {
                return "Information";
            }

            /*
             * Only one value is empty
             * -> Error / No Match
             */
            if (!v1 || !v2) {
                return "Error";
            }

            /*
             * Exact text match
             */
            if (v1 === v2) {
                return "Success";
            }

            /*
             * Numeric comparison
             */
            var n1 = toNumber(value1);
            var n2 = toNumber(value2);

            if (!isNaN(n1) && !isNaN(n2)) {

                /*
                 * Exact numeric match
                 */
                if (n1 === n2) {
                    return "Success";
                }

                /*
                 * Possible match is not allowed
                 */
                if (!bAllowPossible) {
                    return "Error";
                }

                /*
                 * Possible match:
                 * Difference <= 10%
                 */
                if (n1 !== 0 && n2 !== 0) {

                    var percent =
                        Math.abs(n1 - n2) /
                        Math.max(Math.abs(n1), Math.abs(n2));

                    if (percent <= 0.10) {
                        return "Warning";
                    }
                }
            }

            return "Error";
        },

        /*
         * Ship-To colour based on the address match score (adrc_score)
         *   25      -> Success (green)
         *   1 - 24  -> Warning (yellow)
         *   0       -> Error   (red)
         * If adrc_score is not delivered -> falls back to the old text comparison.
         */
        getShipToState: function (vScore, vSoAddress, vQtAddress) {

            var n = toNumber(vScore);

            if (isNaN(n)) {
                return oFormatter.getMatchState(vSoAddress, vQtAddress);
            }

            if (n >= 25) {
                return "Success";
            }

            if (n > 0) {
                return "Warning";
            }

            return "Error";
        },

        getRowClass: function (soValue, qtValue) {
            var sState = oFormatter.getMatchState(
                soValue,
                qtValue
            );

            if (sState === "Success") {
                return "comparisonRow rowGreen";
            }

            if (sState === "Warning") {
                return "comparisonRow rowYellow";
            }

            return "comparisonRow rowRed";
        },

        /*
         * Used for Material / Quantity
         * Strict matching:
         * Success / Error / Information
         */
        getLineState: function (v1, v2) {
            return oFormatter.getMatchState(
                v1,
                v2,
                false
            );
        },

        /*
         * Quantity: OR qty vs open ZCQ qty
         * Success = equal            (green)
         * Warning = OR < open ZCQ    (yellow)
         * None    = OR > open ZCQ    (grey, not possible to link)
         * Error   = value missing    (red, check)
         */
        getQtyState: function (vOrQty, vOpenQty) {
            var n1 = toNumber(vOrQty);
            var n2 = toNumber(vOpenQty);

            if (isNaN(n1) || isNaN(n2)) {
                return (normalize(vOrQty) || normalize(vOpenQty)) ? "Error" : "Information";
            }
            if (sameNum(n1, n2)) {
                return "Success";
            }
            return n1 < n2 ? "Warning" : "None";
        },

        getQtyCellClass: function (v1, v2) {
            var mClass = {
                "Success": "lmMatchSuccess",
                "Warning": "lmMatchWarning",
                "None": "lmMatchGrey",
                "Error": "lmMatchError",
                "Information": "lmMatchInfo"
            };
            return mClass[oFormatter.getQtyState(v1, v2)] || "";
        },

        /*
         * Unit price: OR price vs ZCQ price
         * Success = exact match          (green)
         * Warning = not exact, ZCQ lower (yellow)
         * Error   = not exact, OR lower  (red)
         */
        getPriceState: function (vOrPrice, vZcqPrice) {
            var n1 = toNumber(vOrPrice);
            var n2 = toNumber(vZcqPrice);

            if (isNaN(n1) || isNaN(n2)) {
                return (normalize(vOrPrice) || normalize(vZcqPrice)) ? "Error" : "Information";
            }
            if (sameNum(n1, n2)) {
                return "Success";
            }
            return n2 < n1 ? "Warning" : "Error";
        },

        /*
         * Quantity formatter
         *
         * Example:
         * 10.000 + PAL
         * -> 10 PAL
         */
        formatQtyUnit: function (vQty, sUom) {

            if (
                vQty === undefined ||
                vQty === null ||
                vQty === ""
            ) {
                return "";
            }

            var s = NumberFormat.getFloatInstance({
                maxFractionDigits: 3,
                groupingEnabled: true
            }).format(Number(vQty));

            return sUom
                ? s + " " + sUom
                : s;
        },

        /*
         * Price formatter
         *
         * Example:
         * 229.950 + GBP
         * -> 229.95 GBP
         */
        formatPriceCur: function (vPrice, sCur) {

            if (
                vPrice === undefined ||
                vPrice === null ||
                vPrice === ""
            ) {
                return "";
            }

            var s = NumberFormat.getFloatInstance({
                minFractionDigits: 2,
                maxFractionDigits: 3,
                groupingEnabled: true
            }).format(Number(vPrice));

                        return sCur
                ? s + " " + sCur
                : s;
        },

        /*
         * Amount + currency, value kept exactly as delivered (no grouping)
         * 1430.00 + EUR -> "1430.00 EUR"
         */
        formatAmountCur: function (vAmount, sCur) {

            if (
                vAmount === undefined ||
                vAmount === null ||
                String(vAmount).trim() === ""
            ) {
                return "-";
            }

            var s = String(vAmount).trim();

            return sCur
                ? s + " " + sCur
                : s;
        },

        /*
         * CSS class for Material / Quantity cells
         *
         * Success      -> Green
         * Warning      -> Yellow
         * Error        -> Red
         * Information  -> Blue / Not Maintained
         */
        getCellClass: function (
            v1,
            v2,
            bAllowPossible
        ) {

            var sState = oFormatter.getMatchState(
                v1,
                v2,
                !!bAllowPossible
            );

            var mClass = {
                "Success": "lmMatchSuccess",
                "Warning": "lmMatchWarning",
                "Error": "lmMatchError",
                "Information": "lmMatchInfo",
                "None": "lmMatchGrey"
            };

            return mClass[sState] || "";
        },

        /*
         * Price cell highlighting
         * Allows Warning / Possible Match
         */
        getPriceCellClass: function (v1, v2) {
            var mClass = {
                "Success": "lmMatchSuccess",
                "Warning": "lmMatchWarning",
                "Error": "lmMatchError",
                "Information": "lmMatchInfo"
            };
            return mClass[oFormatter.getPriceState(v1, v2)] || "";
        },

        /*
         * Date formatter
         *
         * Example:
         * 2026-10-05
         * -> 05 Oct 2026
         */
        formatDate: function (sDate) {

            if (!sDate) {
                return "-";
            }

            var oDate = new Date(sDate);

            if (isNaN(oDate.getTime())) {
                return "-";
            }

            return DateFormat.getDateInstance({
                pattern: "dd MMM yyyy"
            }).format(oDate);
        }
    };

    return oFormatter;
});