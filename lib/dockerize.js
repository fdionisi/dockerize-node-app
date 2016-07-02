'use strict';

const fs = require('fs');
const https = require('https');
const os = require('os');
const _ = require('lodash-deep');

const getEnvVariables = (dir) => {
  let lines

  if (!fs.existsSync(`${dir}/.env`)) return ''

  try {
    return (fs.readFileSync(env_file, 'utf8') || '')
      .split(/\r?\n|\r/)
      .filter(line => /\s*=\s*/i.test(line) && !/^\s*\#/i.test(line))
      .reduce((r, line) => {

        line.replace('exports ', '')

        let lineMatch = line.match(/^([^=]+)\s*=\s*(.*)$/)

        if (!lineMatch) return r

        let envKey = lineMatch[1]

        // remove ' and " characters if right side of = is quoted
        let envValue = lineMatch[2].match(/^(['"]?)([^\n]*)\1$/m)[2]

        r.push(`ENV ${envKey} ${envValue}`)
      }, [])
      .join('\n')
  } catch(err) {
    console.log("Environment file could not be read: " + err)
    return ''
  }
}


const getNodeSemVer = (dir, packageJson) => {
  let semVer;

  if (fs.existsSync(`${dir}/.nvmrc`)) {
    semVer = fs.readFileSync(`${dir}/.nvmrc`, 'utf8');
  }

  return semVer || _.deepGet(packageJson, 'engines.node') || 'stable';
};

const getSpecificNodeVersion = semVer =>
  new Promise((resolve, reject) => {
    https.get(`https://semver.io/node/resolve/${semVer}`, res => {
      let data = '';

      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          return resolve(data);
        }

        reject(new Error(`HTTP ${res.statusCode} response - ${data}`));
      });
    }).on('error', err => reject(err));
  });

const getCmd = packageJson => {
  if (_.deepGet(packageJson, 'scripts.start')) {
    return '["npm", "start"]';
  }

  const entrypoint = packageJson.main;

  if (entrypoint) {
    return `["node", "${entrypoint}"]`;
  }
};

module.exports.dockerfile = dir => {
  if (!fs.existsSync(`${dir}/package.json`)) {
    return Promise.reject(new Error(`${dir} does not contain a package.json file!`));
  }

  const packageJson = require(`${dir}/package.json`);

  const semVer = getNodeSemVer(dir, packageJson);
  const runCmd = getCmd(packageJson);
  const envVars = getEnvVariables(dir)

  if (!runCmd) {
    return Promise.reject(new Error('Cannot determine CMD for Dockerfile. Set "start" script or "main" attribute in package.json!'));
  }

  return getSpecificNodeVersion(semVer)
    .then(version =>
      `FROM node:${version}${os.EOL}` +
      envVars + '\n' +
      `COPY . /usr/local/${packageJson.name}${os.EOL}` +
      `WORKDIR /usr/local/${packageJson.name}${os.EOL}` +
      `RUN npm install${os.EOL}` +
      `CMD ${runCmd}`)
    .catch(err => {
      throw new Error(`Unable to get node version for base image from https://semver.io. ${err.message}`);
    });
};
