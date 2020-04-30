const fs = require('fs');
const builder = require('xmlbuilder');
const cheerio = require('cheerio');
const https = require('https');
const LEVEL = 800;
var NUM_LINKS = 150;


//function to build a web page XML doc
var log = null;
var pages= []; // hold relations
var allLinks = []; 


// build an XML file from scraped pages
async function buildXMLFromLinks(f, p){
    console.log("Building XML Document");
    try{
        let xml = builder.create('gexf', { 'encoding': 'UTF-8', 'version': '1.0' })
            .ele('meta', { 'lastmodifieddate': "2020-04-27" })
            .ele('creator', 'Brooke').up()
            .ele('description', 'Gephi doc from scraped Pages').up().up()
            .ele('graph', { mode: "static", defaultedgetype: "directed" }).up();
        // BEGIN NODES
        console.log("Writing nodes...");
        let nodes = xml.ele('nodes');
        f.forEach( (i, index) => {
            nodes.ele('node', { id: index, label: i }).up()
        });
        console.log("Writing edges...");
        let edges = xml.ele('edges');
        for (let i = 0; i < p.length; i++) {
            edges.ele('edge', { id: i, source: f.indexOf(p[i].url), target: f.indexOf(p[i].dest) }).up()
        }
        fs.writeFileSync('./resources/' + process.argv[3] +'.gexf', xml.end({ pretty: true }));
        console.log("Done Bulding XML.");
        console.log("Add version=\"1.3\" to the gefx tag at the top!");
    }
    catch(e){
        throw new Error(e);
    }
}

// wrapped the request in a promise so I would get links in order
function getLinks(url){
    let arr = [];
    return new Promise ((resolve, reject) => {
        var req = https.get(url, (res) => {
        if (res.statusCode === 404){
            reject(new Error(res.statusCode));
        }
        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
            try {
                const $ = cheerio.load(rawData, {xml: { normalizeWhitespace: true }});
                let links = $('a');
                let href = '';
                if(links.length < NUM_LINKS) NUM_LINKS = links.length; //Dont try to push more links that are on the page
                for(let i =0; i <= NUM_LINKS ; i++){
                    if(links[i] === undefined){
                        console.log('undefined link...skipping');
                        continue;
                    };
                    href = links[i].attribs.href; 
                    title = $('title').text(); //get page title
                    if(href !== undefined){
                        if(href.charAt(href.length - 1) === '/'){ //remove a trialing / if any
                            href = href.slice(0,-1);
                        }
                        if(/^http/.test(href) === false){ // add hostname to the beginning of relative links  
                            href = process.argv[2] + href;
                        }
                        if(/^https/.test(href) === false){ //test for https protocol
                            let domain = href.substr(4);
                            href = 'https'+ domain;
                        }
                        if(/#/.test(href)){ // dont visit IDs on the page
                            console.log("ID on page... skipping this link");
                        }
                        else{
                            allLinks.push(href); //use this array for sorting nodes later
                            arr.push({
                                id: i,
                                title: title,
                                url: url,
                                dest: href
                            });
                        }
                    } 
                }
                resolve(arr); // return the array of links   
            } 
            catch (e){
                reject(e);
            }
        });
    });
    req.on('error', (e) => {
        reject(e);
    });
    req.end();
});
}

async function scrapePage(level, index) {
    let url = pages[index].url;
    if(level < LEVEL) { 
        if(pages.length > 1){
            url = pages[index].dest; 
        }
        console.log("Gathering links...");
        // push all of the links into array
        let data = await getLinks(url).catch(err => {
            console.log(err);
            return [];
        });
        pages = [...pages, ...data]; //merge the new array with the existing one
    }
    else{
        console.log("Scraped all links! Building an Gephi XML doc.");
        // pages.forEach(i => {
        //     // console.log("URL: %s and DEST: %s", i.url, i.dest || 'null' );
        //     log.write(`\n${i.id}, ${i.url}, ${i.dest || 'null' }, ${i.title}`);
        // });
        let filtered = allLinks.filter((i ,index) => allLinks.indexOf(i) === index);
        await buildXMLFromLinks(filtered, pages).catch(err => {
            console.log("Error: ", err.reason );
            process.exit(1);
        });
        return;
    }
    scrapePage(level += 1, index += 1);
}


(function(){
    if (!process.argv[2] || !process.argv[3]) {
        console.log('Missing Argument(s)');
        console.log('node index.js <https://www.domain.com> <file-name-of-XML-doc>');
        process.exit(1);
    }
    else {
        console.log("Scraping the site %s for links", process.argv[2]);
        //append data to this file
        // log = fs.createWriteStream('./resources/links.txt', {flags: 'a'});
        pages.push({
            id: 0,
            title: 'Home',
            url: process.argv[2],
            dest: process.argv[2]
        });
        scrapePage(0, 0);
    }
})();