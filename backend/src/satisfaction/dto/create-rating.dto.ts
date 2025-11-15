import { IsInt, IsNotEmpty, Min, Max, IsArray, IsString, IsOptional } from 'class-validator';

export class CreateRatingDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsArray()
  @IsString({ each: true })
  tags: string[];

  @IsString()
  @IsOptional()
  comment?: string;
}

