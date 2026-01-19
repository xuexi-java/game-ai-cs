import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody, ApiHeader } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SignGuard } from './guards/sign.guard';
import { PlayerApiService } from './player-api.service';
import { TokenService } from './services/token.service';
import { PlayerConnectDto, PlayerConnectResponse } from './dto/connect.dto';
import { PlayerUploadResponse, UploadErrorCode, UploadErrorMessages } from './dto/upload.dto';
import { TokenErrorCode } from './dto/token.dto';

/**
 * 扩展Request类型
 */
interface PlayerRequest extends Request {
  game: {
    id: string;
    name: string;
    playerApiSecret?: string;
    playerApiEnabled?: boolean;
  };
  playerInfo: {
    gameid: string;
    uid: string;
    areaid: string;
    playerName?: string;
  };
  tokenPayload?: {
    gameid: string;
    areaid: string;
    uid: string;
    playerName?: string;
  };
}

@ApiTags('Player API')
@Controller('player')
export class PlayerApiController {
  constructor(
    private readonly playerApiService: PlayerApiService,
    private readonly tokenService: TokenService,
  ) {}

  @Post('connect')
  @Public()
  @UseGuards(SignGuard)
  @ApiOperation({
    summary: 'Bootstrap 总入口',
    description: '一次性返回所有初始化需要的信息：wsUrl、wsToken、uploadToken、questList、activeTicket等',
  })
  @ApiResponse({ status: 200, description: '成功', type: PlayerConnectResponse })
  async connect(
    @Body() dto: PlayerConnectDto,
    @Req() req: PlayerRequest,
  ): Promise<PlayerConnectResponse> {
    // 合并 dto 和 playerInfo（playerInfo 来自 SignGuard 验证后的数据）
    const mergedDto = {
      ...dto,
      uid: req.playerInfo.uid,
      areaid: req.playerInfo.areaid,
      gameid: req.playerInfo.gameid,
      playerName: dto.playerName || req.playerInfo.playerName,
    };
    return this.playerApiService.connect(mergedDto, req.game.id);
  }

  @Post('upload')
  @Public()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  @ApiOperation({
    summary: '上传文件',
    description: '上传图片文件，使用 uploadToken 验证身份',
  })
  @ApiHeader({
    name: 'X-Upload-Token',
    description: '上传Token (从 connect 接口获取)',
    required: true,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '图片文件(最大5MB，支持jpeg/png/gif/webp/heic)',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 200, description: '成功', type: PlayerUploadResponse })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-upload-token') uploadToken: string,
  ): Promise<PlayerUploadResponse> {
    console.log('[PlayerUpload] 收到上传请求, file:', file ? `${file.originalname} (${file.size} bytes, ${file.mimetype})` : 'undefined');
    console.log('[PlayerUpload] uploadToken:', uploadToken ? `${uploadToken.substring(0, 20)}...` : 'undefined');

    // 0. 验证文件存在
    if (!file) {
      console.error('[PlayerUpload] 文件未收到');
      return {
        result: false,
        error: UploadErrorMessages[UploadErrorCode.NO_FILE],
        errorCode: UploadErrorCode.NO_FILE,
      };
    }

    // 1. 验证 uploadToken
    if (!uploadToken) {
      console.error('[PlayerUpload] uploadToken 缺失');
      return {
        result: false,
        error: UploadErrorMessages[UploadErrorCode.INVALID_TOKEN],
        errorCode: UploadErrorCode.INVALID_TOKEN,
      };
    }

    const tokenResult = this.tokenService.verifyUploadToken(uploadToken);
    if (!tokenResult.valid || !tokenResult.payload) {
      // 根据 token 验证结果返回对应错误码
      const errorCode = tokenResult.errorCode === TokenErrorCode.EXPIRED_TOKEN
        ? UploadErrorCode.EXPIRED_TOKEN
        : UploadErrorCode.INVALID_TOKEN;
      console.error('[PlayerUpload] uploadToken 验证失败:', tokenResult.errorMessage, 'errorCode:', errorCode);
      return {
        result: false,
        error: tokenResult.errorMessage || UploadErrorMessages[errorCode],
        errorCode,
      };
    }

    console.log('[PlayerUpload] Token验证成功, 调用上传服务');
    // 2. 调用上传服务
    return this.playerApiService.uploadFile(file, {
      gameid: tokenResult.payload.gameid,
      uid: tokenResult.payload.uid,
      areaid: tokenResult.payload.areaid,
    });
  }
}
