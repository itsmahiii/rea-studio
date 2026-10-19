import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { classifyTarget } from '@/main/services/target';

describe('Safe Target Type Detection with Fixtures', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rea-test-fixtures-'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('detects extracted Electron app directory via package.json dependencies', () => {
    const electronDir = path.join(tmpDir, 'extracted-electron-app');
    fs.mkdirSync(electronDir, { recursive: true });
    fs.writeFileSync(
      path.join(electronDir, 'package.json'),
      JSON.stringify({
        name: 'test-electron-app',
        version: '1.0.0',
        main: 'main.js',
        devDependencies: {
          electron: '^30.0.0',
        },
      }),
      'utf-8'
    );

    const result = classifyTarget(electronDir);
    expect(result.targetType).toBe('javascript_electron');
    expect(result.displayType).toBe('JavaScript/Electron');
    expect(result.isDirectory).toBe(true);
    expect(result.exists).toBe(true);
  });

  it('detects extracted Electron app directory via resources/app.asar', () => {
    const electronDir2 = path.join(tmpDir, 'extracted-electron-resources');
    const resourcesDir = path.join(electronDir2, 'resources');
    fs.mkdirSync(resourcesDir, { recursive: true });
    fs.writeFileSync(path.join(resourcesDir, 'app.asar'), Buffer.from([0x04, 0x00, 0x00, 0x00]));

    const result = classifyTarget(electronDir2);
    expect(result.targetType).toBe('javascript_electron');
    expect(result.displayType).toBe('JavaScript/Electron');
    expect(result.isDirectory).toBe(true);
  });

  it('detects standalone .asar archive', () => {
    const asarFile = path.join(tmpDir, 'bundle.asar');
    fs.writeFileSync(asarFile, Buffer.from('FAKE_ASAR_ARCHIVE_DATA'));

    const result = classifyTarget(asarFile);
    expect(result.targetType).toBe('javascript_electron');
    expect(result.displayType).toBe('JavaScript/Electron');
    expect(result.isDirectory).toBe(false);
  });

  it('detects JavaScript bundle directory', () => {
    const jsDir = path.join(tmpDir, 'web-dist-folder');
    fs.mkdirSync(jsDir, { recursive: true });
    fs.writeFileSync(path.join(jsDir, 'bundle.js'), 'console.log("hello");');

    const result = classifyTarget(jsDir);
    expect(result.targetType).toBe('javascript_bundle');
    expect(result.displayType).toBe('JavaScript Bundle');
    expect(result.isDirectory).toBe(true);
  });

  it('detects native Windows PE binary (MZ header without BSJB)', () => {
    const peFile = path.join(tmpDir, 'native_program.exe');
    // MZ header + offset 0x3C pointing to PE\0\0
    const peBuf = Buffer.alloc(256);
    peBuf[0] = 0x4d; // 'M'
    peBuf[1] = 0x5a; // 'Z'
    peBuf.writeUInt32LE(0x80, 0x3c); // e_lfanew = 0x80
    peBuf[0x80] = 0x50; // 'P'
    peBuf[0x81] = 0x45; // 'E'
    peBuf[0x82] = 0x00;
    peBuf[0x83] = 0x00;
    fs.writeFileSync(peFile, peBuf);

    const result = classifyTarget(peFile);
    expect(result.targetType).toBe('native_pe');
    expect(result.displayType).toBe('Windows PE Binary');
  });

  it('detects .NET Assembly (PE binary containing BSJB metadata signature)', () => {
    const dotnetFile = path.join(tmpDir, 'managed_assembly.dll');
    const buf = Buffer.alloc(512);
    buf[0] = 0x4d; // 'M'
    buf[1] = 0x5a; // 'Z'
    buf.writeUInt32LE(0x80, 0x3c);
    buf[0x80] = 0x50;
    buf[0x81] = 0x45;
    // Embed BSJB CLI metadata magic
    buf.write('BSJB', 0x120, 'ascii');
    fs.writeFileSync(dotnetFile, buf);

    const result = classifyTarget(dotnetFile);
    expect(result.targetType).toBe('dotnet_assembly');
    expect(result.displayType).toBe('.NET Assembly');
  });

  it('detects Linux ELF binary (\\x7fELF)', () => {
    const elfFile = path.join(tmpDir, 'libnative.so');
    const elfBuf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    fs.writeFileSync(elfFile, elfBuf);

    const result = classifyTarget(elfFile);
    expect(result.targetType).toBe('native_elf');
    expect(result.displayType).toBe('Linux ELF Binary');
  });

  it('detects macOS Mach-O binary (0xFEEDFACF 64-bit)', () => {
    const machoFile = path.join(tmpDir, 'libnative.dylib');
    const machoBuf = Buffer.alloc(16);
    machoBuf.writeUInt32BE(0xfeedfacf, 0);
    fs.writeFileSync(machoFile, machoBuf);

    const result = classifyTarget(machoFile);
    expect(result.targetType).toBe('native_macho');
    expect(result.displayType).toBe('macOS Mach-O Binary');
  });

  it('detects Android APK (.apk with PK zip magic)', () => {
    const apkFile = path.join(tmpDir, 'sample-app.apk');
    const zipBuf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    fs.writeFileSync(apkFile, zipBuf);

    const result = classifyTarget(apkFile);
    expect(result.targetType).toBe('android_apk');
    expect(result.displayType).toBe('Android APK');
  });

  it('detects SQLite database (SQLite format 3\\0 header)', () => {
    const sqliteFile = path.join(tmpDir, 'storage.sqlite');
    const sqliteHeader = Buffer.from('SQLite format 3\0AdditionalDatabaseContent');
    fs.writeFileSync(sqliteFile, sqliteHeader);

    const result = classifyTarget(sqliteFile);
    expect(result.targetType).toBe('sqlite_database');
    expect(result.displayType).toBe('SQLite Database');
  });

  it('detects Packet Capture file (PCAP-NG magic 0x0a0d0d0a)', () => {
    const pcapFile = path.join(tmpDir, 'traffic.pcapng');
    const pcapBuf = Buffer.from([0x0a, 0x0d, 0x0d, 0x0a, 0x00, 0x00, 0x00, 0x40]);
    fs.writeFileSync(pcapFile, pcapBuf);

    const result = classifyTarget(pcapFile);
    expect(result.targetType).toBe('packet_capture');
    expect(result.displayType).toBe('Packet Capture');
  });

  it('detects Web Archive (.har)', () => {
    const harFile = path.join(tmpDir, 'session.har');
    fs.writeFileSync(harFile, JSON.stringify({ log: { version: '1.2', entries: [] } }));

    const result = classifyTarget(harFile);
    expect(result.targetType).toBe('web_archive');
    expect(result.displayType).toBe('Web Archive (HAR/SAZ)');
  });

  it('detects Firmware image (squashfs hsqs magic)', () => {
    const fwFile = path.join(tmpDir, 'firmware.bin');
    const fwBuf = Buffer.from('hsqsRestOfFirmwarePartitionData');
    fs.writeFileSync(fwFile, fwBuf);

    const result = classifyTarget(fwFile);
    expect(result.targetType).toBe('firmware_image');
    expect(result.displayType).toBe('Firmware Image');
  });

  it('detects Web URL target', () => {
    const result = classifyTarget('https://target-portal.internal.net/dashboard');
    expect(result.targetType).toBe('url');
    expect(result.displayType).toBe('Web Target / URL');
    expect(result.isDirectory).toBe(false);
    expect(result.exists).toBe(true);
  });

  it('handles non-existent target safely without throwing', () => {
    const result = classifyTarget(path.join(tmpDir, 'ghost-file.unknown'));
    expect(result.targetType).toBe('unknown');
    expect(result.exists).toBe(false);
  });
});
