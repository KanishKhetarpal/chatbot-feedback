import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import * as os from 'os';
import { diskStorage } from 'multer';
import { Roles } from '../../common/decorators/roles.decorator';
import { CHAT_AGENT_ROLES } from './chat-agents.constants';
import { CreateKnowledgeSourceDto } from './dto/create-knowledge-source.dto';
import { ListKnowledgeQueryDto } from './dto/list-knowledge-query.dto';
import { UpdateKnowledgeSourceDto } from './dto/update-knowledge-source.dto';
import { UploadKnowledgeFileDto } from './dto/upload-knowledge-file.dto';
import { KNOWLEDGE_FILE_MAX_BYTES } from './knowledge.constants';
import { knowledgeIncomingName } from './knowledge-file-storage.service';
import { KnowledgeUploadCleanupInterceptor } from './knowledge-upload.interceptor';
import { KnowledgeService } from './knowledge.service';

/**
 * Stream the upload to the OS temp dir rather than multer's default of buffering
 * the whole body in the API process heap. `KnowledgeService.uploadFile` moves the
 * file to S3 immediately after parse+persist; the cleanup interceptor removes it
 * if the request never reaches that path.
 */
const KNOWLEDGE_UPLOAD_MULTER = {
  storage: diskStorage({
    destination: (_req: unknown, _file: unknown, cb: (err: Error | null, dir: string) => void) =>
      cb(null, os.tmpdir()),
    filename: (_req: unknown, _file: unknown, cb: (err: Error | null, name: string) => void) =>
      cb(null, knowledgeIncomingName()),
  }),
  limits: { fileSize: KNOWLEDGE_FILE_MAX_BYTES },
};

@ApiTags('knowledge')
@ApiBearerAuth()
@Roles(...CHAT_AGENT_ROLES)
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Knowledge totals for one agent' })
  @ApiResponse({ status: 200, description: 'Summary panel payload' })
  getSummary(@Query() query: ListKnowledgeQueryDto) {
    return this.knowledge.getSummary(query.agentId);
  }

  @Get()
  @ApiOperation({ summary: 'List knowledge sources', description: 'Omit type for every tab.' })
  @ApiResponse({ status: 200, description: '{ sources }' })
  async list(@Query() query: ListKnowledgeQueryDto) {
    return { sources: await this.knowledge.list(query.agentId, query.type) };
  }

  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: 'Add a knowledge source', description: 'Text snippets ingest immediately. Other types are coming soon.' })
  @ApiResponse({ status: 202, description: '{ source }' })
  async create(@Body() dto: CreateKnowledgeSourceDto) {
    return { source: await this.knowledge.create(dto) };
  }

  @Post('upload')
  @HttpCode(201)
  // The cleanup interceptor sits OUTSIDE FileInterceptor deliberately: pipes run
  // inside the interceptor chain, so this is what catches a request the global
  // ValidationPipe refuses after multer has already written the file to disk.
  @UseInterceptors(KnowledgeUploadCleanupInterceptor, FileInterceptor('file', KNOWLEDGE_UPLOAD_MULTER))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a CSV/XLSX as a knowledge source',
    description:
      'Parsed and rendered into a table the model can read, then measured against the agent\'s token budget. ' +
      'Refused up front if it would not fit — everything an agent knows is sent on every message, so the whole table has to fit. ' +
      'A description is required: a spreadsheet does not explain its own columns.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'agentId', 'description'],
      properties: {
        file: { type: 'string', format: 'binary' },
        agentId: { type: 'string', format: 'uuid' },
        name: { type: 'string', description: 'Defaults to the file name.' },
        description: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 201, description: '{ source, report }' })
  @ApiResponse({ status: 400, description: 'unsupported_file_type | unreadable_file | knowledge_too_large | quota_exceeded' })
  async upload(
    @Body() dto: UploadKnowledgeFileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new NotFoundException({ message: 'No file was uploaded.', error: 'file_missing' });
    }
    return this.knowledge.uploadFile(dto, file);
  }

  @Get(':id/file')
  @ApiParam({ name: 'id', description: 'Knowledge source UUID' })
  @ApiOperation({
    summary: 'Get a download URL for the original uploaded file',
    description:
      'Returns a short-lived presigned S3 URL. The client fetches this endpoint, then triggers the download via the returned `url` (window.location.href or an <a href>). May be 410 if the source has no stored file.',
  })
  @ApiResponse({ status: 200, description: '{ url, expiresIn, fileName }' })
  @ApiResponse({ status: 410, description: 'file_not_stored — the extracted text is unaffected' })
  async download(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.getFile(id);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Knowledge source UUID' })
  @ApiOperation({ summary: 'Get one source including its body' })
  @ApiResponse({ status: 200, description: '{ source }' })
  @ApiResponse({ status: 404, description: 'Source not found' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return { source: await this.knowledge.getOne(id) };
  }

  @Patch(':id')
  @ApiParam({ name: 'id', description: 'Knowledge source UUID' })
  @ApiOperation({ summary: 'Rename, toggle enabled, or edit text content' })
  @ApiResponse({ status: 200, description: '{ source }' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateKnowledgeSourceDto) {
    return { source: await this.knowledge.update(id, dto) };
  }

  @Delete(':id')
  @ApiParam({ name: 'id', description: 'Knowledge source UUID' })
  @ApiOperation({ summary: 'Delete a source and its chunks' })
  @ApiResponse({ status: 200, description: '{ id }' })
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.delete(id);
  }

  @Post(':id/resync')
  @ApiParam({ name: 'id', description: 'Knowledge source UUID' })
  @ApiOperation({ summary: 'Re-fetch an external source — not available for text' })
  async resync(@Param('id', ParseUUIDPipe) id: string) {
    return { source: await this.knowledge.resync(id) };
  }
}
