import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsUrl,
  Length,
} from 'class-validator';

export class CreateGameDto {
  @IsString()
  @IsNotEmpty()
  gameCode: string; // 游戏代码（必填）

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean = true;

  @IsString()
  @IsNotEmpty()
  difyApiKey: string;

  @IsUrl()
  @IsNotEmpty()
  difyBaseUrl: string;

  // ========== 玩家API配置 ==========
  @IsString()
  @IsOptional()
  @Length(8, 64)
  playerApiSecret?: string;

  @IsString()
  @IsOptional()
  @Length(8, 32)
  playerApiNonce?: string;

  @IsBoolean()
  @IsOptional()
  playerApiEnabled?: boolean = true;
}

export class UpdateGameDto {
  @IsString()
  @IsOptional()
  gameCode?: string; // 游戏代码（可选，但不建议修改）

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  difyApiKey?: string;

  @IsUrl()
  @IsOptional()
  difyBaseUrl?: string;

  // ========== 玩家API配置 ==========
  @IsString()
  @IsOptional()
  @Length(8, 64)
  playerApiSecret?: string;

  @IsString()
  @IsOptional()
  @Length(8, 32)
  playerApiNonce?: string;

  @IsBoolean()
  @IsOptional()
  playerApiEnabled?: boolean;
}
