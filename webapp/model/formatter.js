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
         * Used for Unit Price
         * Allows Possible Match / Warning
         */
        getPriceState: function (v1, v2) {
            return oFormatter.getMatchState(
                v1,
                v2,
                true
            );
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
                "Information": "lmMatchInfo"
            };

            return mClass[sState] || "";
        },

        /*
         * Price cell highlighting
         * Allows Warning / Possible Match
         */
        getPriceCellClass: function (v1, v2) {

            return oFormatter.getCellClass(
                v1,
                v2,
                true
            );
            
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