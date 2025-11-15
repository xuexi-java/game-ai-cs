import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsObject,
} from 'class-validator';

export class UrgencyRuleConditionsDto {
  @IsOptional()
  keywords?: string[];

  @IsOptional()
  @IsString()
  intent?: string;

  @IsOptional()
  @IsString()
  identityStatus?: string;

  @IsOptional()
  @IsString()
  gameId?: string;

  @IsOptional()
  @IsString()
  serverId?: string;

  @IsOptional()
  @IsString()
  priority?: string;
}

export class CreateUrgencyRuleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean = true;

  @IsInt()
  @Min(1)
  @Max(100)
  priorityWeight: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsNotEmpty()
  conditions: UrgencyRuleConditionsDto;
}

export class UpdateUrgencyRuleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  priorityWeight?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  conditions?: UrgencyRuleConditionsDto;
}

