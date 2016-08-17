// flag for recording time and logging to console
var timer = false;

// how many pixels to cut off from bottom of widget
var shrinkByLink = 10;
var shrinkByNoLink = 27;

// 0-11 mapped to month name
var months = [
    "January"  , "February", "March"   , "April",
    "May"      , "June"    , "July"    , "August",
    "September", "October" , "November", "December"
];

// default url endings
var defaultUrlThis = "/content?sortKey=contentstatus%5Bpublished%5D~recentActivityDateDesc&sortOrder=0";
jive.tile.onOpen(function(config, options) {

    // default config vals if no values given
    config.numResults = config.numResults || 10;
    config.place = config.place || "sub";
    config.type = config.type || ["all"];
    if (config.showLink === undefined) { config.showLink = true };
    config.linkText = config.linkText || "See More Recent Content";
    config.linkUrl = config.linkUrl || "";
    if (config.featured === undefined) { config.featured = false; };

    var indexOfQ = config.type.indexOf("question");
    var getQuestions = indexOfQ !== -1;
    var getDiscussions = config.type.indexOf("discussion") !== -1;
    if (getQuestions) {
        config.type.splice(indexOfQ, 1, "discussion");
    }

    // resize tile if the window changes size (responsive)
    window.onresize = function() {
        resize(config.showLink);
    };

    // resizes window
    function resize(showLink) {
        var shrinkBy = showLink ? shrinkByLink : shrinkByNoLink;
        gadgets.window.adjustHeight( gadgets.window.getHeight() - shrinkBy );
    }

    jive.tile.getContainer(function(container) {
        // set default URL if none set
        if (config.linkUrl === "") {
            config.linkUrl = container.resources.html.ref + defaultUrlThis;
        }

        var docList = [];
        var pending = 0;
        if (timer) {
            var start = Date.now();
        }
        if (config.showLink && config.linkUrl === "") {
            setDefaultUrl(container.placeID, container.parent, config);
        }
        
        var places = ["/places/" + container.placeID];

        if (config.place === "sub") {
            getSubplaces(container);
        } else if (config.place === "this" && config.type.indexOf("post") !== -1) {
            container.getBlog().execute(function(blog) {
                places.push("/places/" + blog.placeID);
                getContent();
            });
        } else {
            getContent();
        }

        function getSubplaces(container) {
            // get sub-places of this place
            if (container.type !== "blog") {
                pending++;
                var options = {
                    count: 100 // most likely not more than 100
                }
                container.getPlaces(options).execute(function(res) {
                    if (res.error) {
                        var code = res.error.code;
                        var message = res.error.message;
                        console.log(code + " " + message);
                        // present the user with an appropriate error message
                    } else {
                        for (place of res.list) {
                            places.push("/places/" + place.placeID);
                            getSubplaces(place);
                        }
                        pending--;
                        if (pending == 0) {
                            if (timer) {
                                console.log("getSubplaces " + (Date.now() - start) + " ms");
                            }
                            getContent();
                        }
                    }
                });
            }
        }

        function getContent(startIndex = 0) {
            // get the recent content
            var reqOptions = {
                count: config.numResults,
                startIndex: startIndex,
                sort: "latestActivityDesc",
                fields: "subject,author.displayName,iconCss,lastActivity,published,question,type"
            }
            // add place if not "all places"
            if (config.place === "sub" || config.place === "this") {
                reqOptions.place = places.join(",");
            }
            // add type if not "all types"
            if (config.type[0] !== "all") {
                reqOptions.type = config.type.join(",");
            }

            if (timer) {
                var reqTime = Date.now();
            }

            if (config.featured) {
                osapi.jive.corev3.places.get({uri: reqOptions.place}).execute(function(res) {
                    res.getFeaturedContent({filter: "type(" + reqOptions.type + ")",fields: reqOptions.fields}).execute(handleResults);
                });
            } else {
                osapi.jive.corev3.contents.get(reqOptions).execute(handleResults);
            }
            
            function handleResults(res) {
                if (res.error) {
                    var code = res.error.code;
                    var message = res.error.message;
                    console.log(code + " " + message);
                    // present the user with an appropriate error message
                } else {
                    if (timer) {
                        console.log("getContent: " + (Date.now() - reqTime) + " ms");
                    }
                    for (let el of res.list) {
                        if (el.type !== "discussion" || (getQuestions && el.question) || (getDiscussions && !el.question)) {
                            docList.push({
                                subject: replaceCodes(el.subject),
                                url: el.resources.html.ref,
                                author: el.author.displayName,
                                authorUrl: el.author.resources.html.ref,
                                icon: el.iconCss,
                                avatar: el.author.resources.avatar.ref,
                                lastAct: el.lastActivity,
                                postDate: el.published
                            });
                            if (docList.length >= config.numResults) {
                                break;
                            }
                        }
                    }
                    if ((!getQuestions || !getDiscussions) && (docList.length < config.numResults) && res.links && res.links.next) {
                        getContent(startIndex + config.numResults);
                    } else {
                        showDocs();
                    }
                }
            }
        }

        function formatDate(date) {
            var dateStr = date.getDate() + "";
            if (dateStr.length < 2) {
                dateStr = "0" + dateStr;
            }
            var monthStr = months[date.getMonth()].substring(0, 3);
            var yearStr = date.getFullYear() + "";

            return dateStr + "-" + monthStr + "-" + yearStr;
        }

        function showDocs() {
            if (timer) {
                var showDocsBegin = Date.now();
            }

            var ul = document.getElementById("ul-list");
            var table = document.getElementById("content-table");
            var link = document.getElementById("link");

            for (var doc of docList) {
                // create list node
                var li = document.createElement("li");
                li.classList.add("listItem", "showIcon", "ic24");

                // create link
                var a = document.createElement("a");
                a.setAttribute("target", "_top");
                a.setAttribute("href", doc.url);
                var icon = document.createElement("span");
                var iconClasses = doc.icon.split(" ");
                for (var c of iconClasses) {
                    icon.classList.add(c);
                }
                icon.classList.add("jive-icon-big");
                var docSubj = document.createTextNode(doc.subject);
                a.appendChild(icon);  
                a.appendChild(docSubj);

                // create timestamp + author
                var tsDiv = document.createElement("div");
                tsDiv.className = "linkDescription";
                tsDiv.appendChild( document.createTextNode(moment(doc.postDate).fromNow() + "  ") );
                var authorUrl = a.cloneNode();
                authorUrl.setAttribute("href", doc.authorUrl);
                var author = document.createTextNode("by " + doc.author);
                authorUrl.appendChild(author);
                tsDiv.appendChild(authorUrl);

                li.appendChild(a);  
                li.appendChild(tsDiv);
                ul.appendChild(li);
                
                // create table row node
                var tr = document.createElement("tr");
                var td1 = document.createElement("td");
                var td2 = td1.cloneNode(), td3 = td1.cloneNode();
                td1.appendChild(a.cloneNode(true));
                var authorUrl2 = authorUrl.cloneNode();
                var avatar = document.createElement("img");
                avatar.classList.add("img-circle", "avatar");
                avatar.setAttribute("src", doc.avatar);
                avatar.setAttribute("height", "30px");
                authorUrl2.appendChild(avatar);
                authorUrl2.appendChild(author.cloneNode());
                td2.appendChild(authorUrl2);
                var postDate = formatDate(new Date(doc.postDate));
                var postDateNode = document.createTextNode(postDate);
                td3.appendChild(postDateNode);
                tr.appendChild(td1);
                tr.appendChild(td2);
                tr.appendChild(td3);
                table.appendChild(tr);

                if (ul.children.length >= config.numResults) {
                    break;
                }
            }
            if (config.showLink) {
                link.setAttribute("href", config.linkUrl);
                var linkText = document.createTextNode(config.linkText);
                link.appendChild(linkText);
            }
            document.getElementsByClassName("glyphicon-refresh")[0].style.display = "none";

            if (timer) {
                console.log("showDocs " + (Date.now() - showDocsBegin) + " ms");
            }
            resize(config.showLink);
        }

        function replaceCodes(str) {
            str = str.replace(/&#160;/g, " ");
            str = str.replace(/&amp;/g, "&");
            return str;
        }

    });
});
