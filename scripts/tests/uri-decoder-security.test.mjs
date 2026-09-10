import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(filename), '../..');

let installedModulesPromise;

function installedModules() {
  installedModulesPromise ??= (async () => {
    const mobileRequire = createRequire(path.join(root, 'artifacts/mobile/package.json'));
    const expoPackage = mobileRequire.resolve('expo/package.json');
    const expoRequire = createRequire(expoPackage);
    const queryStringPackage = expoRequire.resolve('query-string/package.json');
    const queryStringRequire = createRequire(queryStringPackage);
    const decoderPath = queryStringRequire.resolve('decode-uri-component');
    const decoderPackage = path.join(path.dirname(decoderPath), 'package.json');
    const decoderMetadata = JSON.parse(readFileSync(decoderPackage, 'utf8'));

    assert.match(queryStringPackage, /query-string@7\.1\.3/);
    assert.match(decoderPath, /decode-uri-component@0\.5\.0/);
    assert.equal(decoderMetadata.version, '0.5.0');
    assert.equal(decoderMetadata.exports.import, './index.js');
    assert.equal(decoderMetadata.exports.require, './index.cjs');
    assert.equal(decoderMetadata.exports.types, './index.d.ts');
    assert.equal(decoderMetadata.exports.default, './index.js');
    assert.ok(queryStringPackage.includes(`${path.sep}node_modules${path.sep}`));
    assert.ok(decoderPath.includes(`${path.sep}node_modules${path.sep}`));
    assert.ok(!queryStringPackage.includes(`${path.sep}.local${path.sep}`));
    assert.ok(!decoderPath.includes(`${path.sep}.local${path.sep}`));

    return {
      queryString: expoRequire('query-string'),
      cjsDecoder: queryStringRequire('decode-uri-component'),
      esmDecoder: (await import(pathToFileURL(path.join(
        path.dirname(decoderPath),
        decoderMetadata.exports.import,
      )))).default,
    };
  })();

  return installedModulesPromise;
}

function assertDecoderParity(cjsDecoder, esmDecoder, vectors) {
  for (const [input, expected] of vectors) {
    assert.equal(cjsDecoder(input), expected, `CommonJS: ${input.slice(0, 80)}`);
    assert.equal(esmDecoder(input), expected, `ESM: ${input.slice(0, 80)}`);
  }
}

const cases = {
  async valid() {
    const {queryString, cjsDecoder, esmDecoder} = await installedModules();
    const values = [
      'plain ASCII',
      'München café',
      '東京',
      'مرحبا بالعالم',
      '👩🏽‍⚕️🩺',
      'a+b & c=d / ? #',
      'https://example.test/患者/診察?next=https%3A%2F%2Fclinic.test%2Fa%3Fx%3D1',
    ];

    for (const [index, value] of values.entries()) {
      const key = `field${index}`;
      const encoded = `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
      assert.equal(queryString.parse(encoded)[key], value);
    }

    const nested = 'https://clinic.test/path?patient=Zoë&emoji=🫀&next=%2Fvisits%3Fa%3D1';
    assert.equal(
      queryString.parse(`redirect=${encodeURIComponent(encodeURIComponent(nested))}`).redirect,
      encodeURIComponent(nested),
    );
    assert.deepEqual(
      queryString.parse('name=Ana+Mar%C3%ADa&tag=%F0%9F%A9%BA&tag=follow-up', {arrayFormat: 'none'}),
      Object.assign(Object.create(null), {name: 'Ana María', tag: ['🩺', 'follow-up']}),
    );

    assertDecoderParity(cjsDecoder, esmDecoder, [
      ...values.map(value => [encodeURIComponent(value), value]),
      ['one+two%20three', 'one+two three'],
      ['%2520-%20', '%20- '],
    ]);
    assert.throws(() => cjsDecoder(null), TypeError);
    assert.throws(() => esmDecoder(null), TypeError);
  },

  async malformed() {
    const {queryString, cjsDecoder, esmDecoder} = await installedModules();
    const expectations = {
      lone: '%',
      badHex: '%G0%2',
      truncatedTwo: '\uFFFD',
      invalidContinuation: '%E2(%A1',
      continuationOnly: '%80%BF',
      overlong: '%C0%AF',
      surrogate: '%ED%A0%80',
      tooLarge: '%F4%90%80%80',
      mixed: 'ok-å-%AB-end',
      plus: 'one two three',
      bom: '\uFFFD\uFFFD',
      once: '%20- -%AB',
      replacementMetas: '$& $` $\' %AB',
    };
    const parsed = queryString.parse(
      'lone=%&badHex=%G0%2&truncatedTwo=%C2'
      + '&invalidContinuation=%E2%28%A1&continuationOnly=%80%BF'
      + '&overlong=%C0%AF&surrogate=%ED%A0%80&tooLarge=%F4%90%80%80'
      + '&mixed=ok-%C3%A5-%AB-end&plus=one+two%20three&bom=%FE%FF'
      + '&once=%2520-%20-%AB&replacementMetas=$%26%20$`%20$\'%20%AB',
    );

    for (const [key, expected] of Object.entries(expectations)) {
      assert.equal(parsed[key], expected, key);
    }

    assertDecoderParity(cjsDecoder, esmDecoder, [
      ['%', expectations.lone],
      ['%G0%2', expectations.badHex],
      ['%C2', expectations.truncatedTwo],
      ['%E2%28%A1', expectations.invalidContinuation],
      ['%80%BF', expectations.continuationOnly],
      ['%C0%AF', expectations.overlong],
      ['%ED%A0%80', expectations.surrogate],
      ['%F4%90%80%80', expectations.tooLarge],
      ['ok-%C3%A5-%AB-end', expectations.mixed],
      ['%FE%FF', expectations.bom],
      ['%2520-%20-%AB', expectations.once],
      ['$%26%20$`%20$\'%20%AB', expectations.replacementMetas],
    ]);
  },

  async adversarial() {
    const {queryString, cjsDecoder, esmDecoder} = await installedModules();
    const hostile = '%84%D7%25%88%90'.repeat(20_000);
    const hostileExpected = '%84%D7%%88%90'.repeat(20_000);
    const parsed = queryString.parse(`payload=${hostile}&safe=yes`);
    assert.equal(parsed.safe, 'yes');
    assert.equal(parsed.payload, hostileExpected);

    const truncated = '%E0%A4%A'.repeat(20_000);
    assert.equal(queryString.parse(`payload=${truncated}`).payload.length, truncated.length);

    const runs = [];
    const expected = [];
    for (let index = 0; index < 20_000; index++) {
      const character = String.fromCodePoint(0x1000 + index);
      runs.push(`${encodeURIComponent(character)}literal`);
      expected.push(`${character}literal`);
    }

    const distinctRuns = `${runs.join('')}%`;
    assert.ok(distinctRuns.length >= 320_000);
    assert.equal(
      queryString.parse(`payload=${distinctRuns}`).payload,
      `${expected.join('')}%`,
    );

    assertDecoderParity(cjsDecoder, esmDecoder, [
      [hostile, hostileExpected],
      [truncated, truncated],
      [distinctRuns, `${expected.join('')}%`],
    ]);
  },
};

if (process.argv[2] === '--case') {
  await cases[process.argv[3]]();
} else {
  for (const name of Object.keys(cases)) {
    test(`${name} URI decoding terminates safely`, () => {
      const result = spawnSync(process.execPath, [filename, '--case', name], {
        cwd: root,
        encoding: 'utf8',
        timeout: name === 'adversarial' ? 1500 : 1000,
      });
      assert.notEqual(result.error?.code, 'ETIMEDOUT', `${name} case blocked the event loop`);
      assert.equal(result.status, 0, result.stderr || result.stdout);
    });
  }
}